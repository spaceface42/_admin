// Name of the sessionStorage entry that holds the PAT.
// This is only a label. NEVER put the token itself here.
const TOKEN_KEY = 'cms_github_pat';
const store = window.sessionStorage; // cleared when the tab closes

const IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon'
};
const TEXT_EXTS = new Set(['txt', 'md', 'css', 'js', 'mjs', 'json', 'xml', 'csv', 'yml', 'yaml', 'toml']);

// Speed settings
const BLOB_CACHE_MAX_BYTES = 30 * 1024 * 1024; // in-memory file cache
const PREFETCH_MAX_FILES = 40; // files fetched in the background after the tree loads
const PREFETCH_MAX_BYTES = 256 * 1024; // skip big files when prefetching
const PREFETCH_WORKERS = 3;
const HOVER_PREFETCH_DELAY_MS = 120;
const REVALIDATE_AFTER_MS = 30 * 1000; // re-check the repo when the tab regains focus

let cfg = null;
let currentFile = null;
let selectedMediaEl = null;
let openSeq = 0; // guards against out-of-order responses when clicking files quickly
let previewUrl = null;

// File tree state
let treeEntries = []; // [{ path, sha, size }]
const shaByPath = new Map();
let treePromise = null;
let treeFresh = false; // true once the tree has been confirmed against GitHub this session
let lastTreeCheck = 0;
let prefetchGen = 0;
let hoverTimer = null;

// Blobs are content-addressed (keyed by sha), so a cached copy can never be stale.
const blobCache = new Map(); // sha -> ArrayBuffer (Map order = least recently used first)
const blobInflight = new Map(); // sha -> Promise<ArrayBuffer>
let blobCacheBytes = 0;

const $ = (id) => document.getElementById(id);

/* ---------- helpers ---------- */

// Encode each path segment but keep the slashes (the contents API rejects %2F).
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
const rootPrefix = () => (cfg.root ? `${cfg.root}/` : '');
const fullPath = (rel) => [cfg.root, rel.replace(/^\/+/, '')].filter(Boolean).join('/');
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function textToBuffer(str) {
  const bytes = new TextEncoder().encode(str);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function extOf(path) {
  const name = path.split('/').pop();
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function fileKind(path) {
  const ext = extOf(path);
  if (ext === 'html' || ext === 'htm') return 'html';
  if (IMAGE_MIME[ext]) return 'img';
  if (ext === '' || TEXT_EXTS.has(ext)) return 'text';
  return 'binary'; // never decode/re-save these as text: it would corrupt them
}

function setStatus(msg, isError = false) {
  const el = $('status-msg');
  el.textContent = msg;
  el.style.color = isError ? '#dc2626' : '#4b5563';
}

function showLogin() {
  $('login-screen').classList.remove('hidden');
  $('pat-input').focus();
}

function showEditor(kind) {
  $('html-editor').classList.toggle('hidden', kind !== 'html');
  $('text-editor').classList.toggle('hidden', kind !== 'text');
  $('image-preview').classList.toggle('hidden', kind !== 'img');
}

async function ghFetch(endpoint, options = {}) {
  const token = store.getItem(TOKEN_KEY);
  const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${endpoint}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  if (res.status === 401) showLogin();
  return res;
}

// Turns a failed GitHub response into a readable message.
// `conflict` is true when the file changed on GitHub since we loaded it (409, or a 422 about the sha).
async function describeFailure(res, action) {
  let detail = '';
  try {
    detail = String((await res.json()).message || '');
  } catch (_) {
    /* body was not JSON */
  }
  const status = res.status;
  const conflict = status === 409 || (status === 422 && /\bsha\b/i.test(detail));
  let text;

  if (conflict) {
    text = `${action} failed: the file changed on GitHub since you opened it. Re-open it to load the latest version.`;
  } else if (status === 401) {
    text = 'Token invalid or expired. Please log in again.';
  } else if (status === 429 || (status === 403 && res.headers.get('x-ratelimit-remaining') === '0')) {
    text = 'GitHub rate limit reached. Wait a bit and try again.';
  } else if (status === 403) {
    text = `${action} failed: no permission (the token needs Contents: Read & Write, and the branch must allow pushes).`;
  } else if (status === 404) {
    text = `${action} failed: not found (check config.json and that the token can access the repo).`;
  } else if (status === 422) {
    text = `${action} failed: ${detail || 'GitHub rejected the request'}`;
  } else if (status >= 500) {
    text = `${action} failed: GitHub is having problems (${status}). Try again shortly.`;
  } else {
    text = `${action} failed (${status})${detail ? `: ${detail}` : ''}`;
  }
  return { text, conflict, status, detail };
}

// Runs an action once at a time. Ignores extra clicks while busy and shows any thrown error in the status bar.
let busy = false;
async function guarded(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (err) {
    if (err instanceof TypeError) {
      setStatus('Network error: could not reach GitHub', true);
    } else {
      setStatus((err && err.message) || 'Something went wrong', true);
    }
  } finally {
    busy = false;
  }
}

/* ---------- blob cache (instant re-opens, prefetch) ---------- */

function getCachedBlob(sha) {
  const buf = blobCache.get(sha);
  if (buf) {
    blobCache.delete(sha); // mark as most recently used
    blobCache.set(sha, buf);
  }
  return buf;
}

function cacheBlob(sha, buf) {
  if (!sha || blobCache.has(sha)) return;
  blobCache.set(sha, buf);
  blobCacheBytes += buf.byteLength;
  for (const [key, val] of blobCache) {
    if (blobCacheBytes <= BLOB_CACHE_MAX_BYTES) break;
    if (key === sha) continue;
    blobCache.delete(key); // evict least recently used
    blobCacheBytes -= val.byteLength;
  }
}

// Fetches a file's raw bytes by blob sha. Works for any size, and concurrent
// callers (hover prefetch + click) share a single request.
function fetchBlob(sha) {
  const hit = getCachedBlob(sha);
  if (hit) return Promise.resolve(hit);
  if (blobInflight.has(sha)) return blobInflight.get(sha);

  const p = (async () => {
    const res = await ghFetch(`/git/blobs/${sha}`, {
      headers: { Accept: 'application/vnd.github.raw+json' }
    });
    if (!res.ok) throw new Error((await describeFailure(res, 'Loading file')).text);
    const buf = await res.arrayBuffer();
    cacheBlob(sha, buf);
    return buf;
  })().finally(() => blobInflight.delete(sha));

  blobInflight.set(sha, p);
  return p;
}

// Quietly download the small text/HTML files so they open instantly later.
async function startPrefetch() {
  const gen = ++prefetchGen;
  const rank = (f) => (fileKind(f.path) === 'html' ? 0 : 1);
  const queue = treeEntries
    .filter((f) => {
      const k = fileKind(f.path);
      return (k === 'html' || k === 'text') && f.size > 0 && f.size <= PREFETCH_MAX_BYTES && !blobCache.has(f.sha);
    })
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, PREFETCH_MAX_FILES);

  const worker = async () => {
    while (queue.length && gen === prefetchGen) {
      const f = queue.shift();
      try {
        await fetchBlob(f.sha);
      } catch (_) {
        /* prefetch is best-effort */
      }
    }
  };
  await Promise.all(Array.from({ length: PREFETCH_WORKERS }, worker));
}

function hoverPrefetch(path) {
  clearTimeout(hoverTimer);
  const kind = fileKind(path);
  if (kind !== 'html' && kind !== 'text') return;
  hoverTimer = setTimeout(() => {
    const sha = shaByPath.get(path);
    if (sha) fetchBlob(sha).catch(() => {});
  }, HOVER_PREFETCH_DELAY_MS);
}

/* ---------- init ---------- */

async function init() {
  // One-time cleanup: older versions kept the token in localStorage under a
  // key that started with "github_pat_". Remove any leftovers.
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('github_pat_'))
      .forEach((k) => localStorage.removeItem(k));
  } catch (_) {
    /* storage unavailable; nothing to clean */
  }

  try {
    const cfgRes = await fetch('config.json');
    if (!cfgRes.ok) throw new Error(`config.json ${cfgRes.status}`);
    cfg = await cfgRes.json();
  } catch (err) {
    setStatus(`Could not load config.json (${err.message})`, true);
    return;
  }
  cfg.root = (cfg.root || '').replace(/^\/+|\/+$/g, '');
  if (!cfg.siteUrl.endsWith('/')) cfg.siteUrl += '/';

  $('login-form').onsubmit = (e) => {
    e.preventDefault(); // otherwise the form reloads the page
    const val = $('pat-input').value.trim();
    if (!val) return;
    store.setItem(TOKEN_KEY, val);
    $('pat-input').value = '';
    $('login-screen').classList.add('hidden');
    bootTree().catch((err) => setStatus(err.message || 'Failed to load repo tree', true));
  };

  $('logout-btn').onclick = () => {
    store.removeItem(TOKEN_KEY);
    try {
      localStorage.removeItem(treeCacheKey());
    } catch (_) {
      /* ignore */
    }
    location.reload();
  };

  // Every action that talks to GitHub goes through guarded(): one at a time, errors shown in the status bar.
  $('new-btn').onclick = () => guarded(createNewFile);
  $('save-btn').onclick = () => guarded(saveCurrentFile);
  $('delete-btn').onclick = () => guarded(deleteCurrentFile);
  $('upload-input').onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // reset so picking the same file again still fires "change"
    if (file) guarded(() => uploadImageFile(file));
  };

  ['href', 'src', 'alt'].forEach((attr) => {
    $(`attr-${attr}`).oninput = (e) => {
      if (selectedMediaEl) selectedMediaEl.setAttribute(attr, e.target.value);
    };
  });

  // Pick up changes made elsewhere (other commits, other tabs) when you come back to this tab.
  document.addEventListener('visibilitychange', () => {
    if (
      document.visibilityState === 'visible' &&
      store.getItem(TOKEN_KEY) &&
      Date.now() - lastTreeCheck > REVALIDATE_AFTER_MS
    ) {
      loadTree().catch(() => {});
    }
  });

  if (!store.getItem(TOKEN_KEY)) {
    showLogin();
  } else {
    bootTree().catch((err) => setStatus(err.message || 'Failed to load repo tree', true));
  }
}

/* ---------- file tree ---------- */

// The file list is not secret, so it is cached in localStorage and shown instantly on the next visit
// while GitHub is asked (in the background) whether anything changed. Logout clears it.
const treeCacheKey = () => `cms_tree:${cfg.owner}/${cfg.repo}@${cfg.branch}:${cfg.root}`;

function bootTree() {
  try {
    const cached = JSON.parse(localStorage.getItem(treeCacheKey()) || 'null');
    if (
      Array.isArray(cached) &&
      cached.length &&
      cached.every((e) => e && typeof e.path === 'string' && typeof e.sha === 'string')
    ) {
      applyTree(cached, false);
    }
  } catch (_) {
    /* ignore a corrupt cache */
  }
  return loadTree();
}

function applyTree(entries, persist = true) {
  const sig = (list) => list.map((e) => e.path).join('\n');
  const sorted = [...entries].sort(byPath);
  const listChanged = sig(sorted) !== sig(treeEntries);

  treeEntries = sorted;
  shaByPath.clear();
  sorted.forEach((e) => shaByPath.set(e.path, e.sha));

  if (listChanged) renderTree(); // skip needless re-renders so the sidebar doesn't jump

  if (persist) {
    try {
      localStorage.setItem(treeCacheKey(), JSON.stringify(sorted));
    } catch (_) {
      /* storage full or unavailable */
    }
  }
}

function renderTree() {
  const prefix = rootPrefix();
  const ul = $('file-tree');
  ul.innerHTML = '';
  treeEntries.forEach((f) => {
    const li = document.createElement('li');
    li.textContent = f.path.slice(prefix.length);
    li.dataset.path = f.path;
    if (currentFile && currentFile.path === f.path) li.classList.add('active');
    li.onclick = () => openFile(f.path);
    li.onmouseenter = () => hoverPrefetch(f.path);
    li.onmouseleave = () => clearTimeout(hoverTimer);
    ul.appendChild(li);
  });
}

// Local changes (save / create / delete) update the list immediately instead of re-downloading it.
function upsertEntry(path, sha, size) {
  applyTree([...treeEntries.filter((e) => e.path !== path), { path, sha, size: size || 0 }]);
  lastTreeCheck = Date.now();
}

function removeEntry(path) {
  applyTree(treeEntries.filter((e) => e.path !== path));
  lastTreeCheck = Date.now();
}

function loadTree() {
  if (treePromise) return treePromise;
  treePromise = fetchTree(treeFresh).finally(() => {
    treePromise = null;
  });
  return treePromise;
}

async function fetchTree(silent) {
  if (!silent) setStatus(treeEntries.length ? 'Checking for changes...' : 'Loading file tree...');

  let res = null;
  try {
    // "no-cache" = always ask GitHub, but let it answer 304 (tiny, fast) when nothing changed.
    res = await ghFetch(`/git/trees/${cfg.branch}?recursive=1`, { cache: 'no-cache' });
  } catch (_) {
    res = null;
  }

  if (!res || !res.ok) {
    let msg;
    if (!res) {
      msg = treeEntries.length
        ? 'Could not reach GitHub (showing the last known file list)'
        : 'Could not reach GitHub. Check your connection.';
    } else if (res.status === 401) {
      msg = 'Token invalid or expired. Please log in again.';
    } else {
      msg = treeEntries.length
        ? `Could not refresh the file list (${res.status}, showing the last known copy)`
        : `Failed to load repo tree (${res.status}). Check token or config.json.`;
    }
    setStatus(msg, true);
    return; // ghFetch already shows the login screen on 401
  }

  let data;
  try {
    data = await res.json();
  } catch (_) {
    setStatus('GitHub sent an unreadable file list', true);
    return;
  }

  const prefix = rootPrefix();
  const entries = data.tree
    .filter((item) => item.type === 'blob' && item.path.startsWith(prefix))
    .map(({ path, sha, size }) => ({ path, sha, size: size || 0 }));

  applyTree(entries);
  treeFresh = true;
  lastTreeCheck = Date.now();
  if (!silent) setStatus(data.truncated ? 'Ready (repo is large: file list is truncated)' : 'Ready');

  startPrefetch();
}

/* ---------- open / render ---------- */

async function openFile(path) {
  const seq = ++openSeq;
  setStatus(`Opening ${path}...`);
  $('attr-panel').classList.add('hidden');
  selectedMediaEl = null;

  const kind = fileKind(path);
  let sha;
  let buf = null;

  try {
    // If we're still showing the cached list, make sure we have the latest shas first (usually a few ms).
    if (!treeFresh && treePromise) {
      await treePromise;
      if (seq !== openSeq) return;
    }

    sha = shaByPath.get(path);
    if (!sha) {
      // Not in our list (e.g. added elsewhere moments ago): ask GitHub for the current sha.
      const res = await ghFetch(`/contents/${encPath(path)}?ref=${encodeURIComponent(cfg.branch)}`, {
        cache: 'no-store'
      });
      if (seq !== openSeq) return;
      if (!res.ok) {
        const f = await describeFailure(res, 'Opening file');
        return setStatus(f.text, true);
      }
      sha = (await res.json()).sha;
      shaByPath.set(path, sha);
    }

    if (kind !== 'binary') {
      buf = await fetchBlob(sha); // instant if prefetched or opened before
      if (seq !== openSeq) return;
    }
  } catch (err) {
    if (seq === openSeq) {
      setStatus(err instanceof TypeError ? 'Network error: could not reach GitHub' : err.message || 'Error fetching file', true);
    }
    return;
  }

  currentFile = { path, sha, type: kind };

  document.querySelectorAll('#file-tree li').forEach((li) => {
    li.classList.toggle('active', li.dataset.path === path);
  });

  $('current-path').textContent = path;
  $('delete-btn').disabled = false;
  $('save-btn').disabled = true; // enabled below once the content is actually loaded

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  if (kind === 'html') {
    showEditor('html');
    const iframe = $('html-editor');
    // Don't allow saving until the iframe has finished loading, otherwise we'd serialize an empty doc.
    iframe.onload = () => {
      if (seq === openSeq) $('save-btn').disabled = false;
    };
    renderHtmlInIframe(new TextDecoder().decode(buf), path);
    setStatus('Loaded');
  } else if (kind === 'text') {
    showEditor('text');
    $('text-editor').value = new TextDecoder().decode(buf);
    $('save-btn').disabled = false;
    setStatus('Loaded');
  } else if (kind === 'img') {
    showEditor('img');
    previewUrl = URL.createObjectURL(new Blob([buf], { type: IMAGE_MIME[extOf(path)] }));
    $('preview-img').src = previewUrl;
    setStatus('Loaded');
  } else {
    showEditor(null);
    setStatus('Binary file: preview and editing are not supported (you can still delete it).');
  }
}

// Runs inside the preview iframe. It only handles selecting/editing elements.
const EDITOR_SCRIPT = `
(function() {
  const TEXT_TAGS = new Set([
    'H1','H2','H3','H4','H5','H6','P','LI','A','SPAN','BUTTON',
    'LABEL','TD','TH','BLOCKQUOTE','FIGCAPTION','STRONG','EM','B','I','SMALL'
  ]);
  const NO_ENTER_TAGS = new Set(['H1','H2','H3','H4','H5','H6','BUTTON','A','SPAN','LABEL']);
  let hovered = null;
  let active = null;

  document.addEventListener('mouseover', (e) => {
    const t = e.target;
    if (t === document.body || t === document.documentElement) return;
    if (hovered && hovered !== t) hovered.removeAttribute('data-cms-hover');
    hovered = t;
    hovered.setAttribute('data-cms-hover', '');
  });

  document.addEventListener('mouseout', (e) => {
    if (e.target && e.target.hasAttribute('data-cms-hover')) {
      e.target.removeAttribute('data-cms-hover');
    }
  });

  document.addEventListener('submit', (e) => e.preventDefault(), true);

  document.addEventListener('click', (e) => {
    if (e.target.closest('a, button, input[type="submit"]')) {
      e.preventDefault();
    }
    const t = e.target;
    if (t === document.body || t === document.documentElement) return;
    e.stopPropagation();

    if (active && active !== t) {
      active.removeAttribute('data-cms-active');
      active.removeAttribute('contenteditable');
    }

    active = t;
    active.setAttribute('data-cms-active', '');

    if (TEXT_TAGS.has(active.tagName)) {
      active.setAttribute('contenteditable', 'true');
      active.focus();
    }

    const mediaTarget = active.tagName === 'IMG' ? active : active.closest('a');
    window.__cmsMediaTarget = mediaTarget || null;
    window.parent.postMessage({
      type: 'CMS_SELECT',
      tag: mediaTarget ? mediaTarget.tagName : null
    }, '*');
  }, true);

  document.addEventListener('keydown', (e) => {
    if (active && NO_ENTER_TAGS.has(active.tagName) && e.key === 'Enter') {
      e.preventDefault();
    }
  });
})();
`;

function renderHtmlInIframe(rawHtml, path) {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

  const dt = doc.doctype;
  const doctypeStr = dt
    ? `<!DOCTYPE ${dt.name}${dt.publicId ? ` PUBLIC "${dt.publicId}"` : ''}${dt.systemId ? ` "${dt.systemId}"` : ''}>`
    : '<!DOCTYPE html>';

  // The preview iframe is same-origin with this admin page (needed to read it back on save),
  // so the page being edited must NOT be able to run its own scripts: they could read the PAT.
  // A CSP that only allows our nonce'd editor script blocks every page script, inline event
  // handler and javascript: URL. The page's own scripts stay untouched in the saved HTML.
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));

  // Park the page's own CSP <meta> tags (restored on save) so they can't block the editor script.
  doc.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]').forEach((m) => {
    m.setAttribute('data-cms-orig-http-equiv', m.getAttribute('http-equiv'));
    m.removeAttribute('http-equiv');
  });

  // Resolve relative URLs against the page's own folder, not the site root.
  const rel = path.slice(rootPrefix().length);
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
  const base = doc.createElement('base');
  base.href = cfg.siteUrl + encPath(dir);
  base.setAttribute('data-cms-injected', 'true');

  const csp = doc.createElement('meta');
  csp.setAttribute('http-equiv', 'Content-Security-Policy');
  csp.setAttribute('content', `script-src 'nonce-${nonce}'; object-src 'none'`);
  csp.setAttribute('data-cms-injected', 'true');

  // CSP first, so it is in effect before anything else in <head> is parsed.
  doc.head.prepend(base);
  doc.head.prepend(csp);

  const style = doc.createElement('style');
  style.setAttribute('data-cms-injected', 'true');
  style.textContent = `
    [data-cms-hover] { outline: 2px dashed #3b82f6 !important; outline-offset: 2px !important; }
    [data-cms-active] { outline: 2px solid #2563eb !important; outline-offset: 2px !important; }
  `;
  doc.head.appendChild(style);

  const script = doc.createElement('script');
  script.setAttribute('data-cms-injected', 'true');
  script.setAttribute('nonce', nonce);
  script.textContent = EDITOR_SCRIPT;
  doc.body.appendChild(script);

  const iframe = $('html-editor');
  iframe.dataset.doctype = doctypeStr;
  iframe.srcdoc = `${doctypeStr}\n${doc.documentElement.outerHTML}`;
}

// Only accept selection messages from our own preview iframe.
window.addEventListener('message', (e) => {
  const iframeWin = $('html-editor').contentWindow;
  if (!iframeWin || e.source !== iframeWin) return;
  if (!e.data || e.data.type !== 'CMS_SELECT') return;

  const target = iframeWin.__cmsMediaTarget || null;
  selectedMediaEl = target;

  if (!target) {
    $('attr-panel').classList.add('hidden');
    return;
  }

  $('attr-panel').classList.remove('hidden');
  const isLink = target.tagName === 'A';
  const isImg = target.tagName === 'IMG';

  $('href-row').classList.toggle('hidden', !isLink);
  $('src-row').classList.toggle('hidden', !isImg);
  $('alt-row').classList.toggle('hidden', !isImg);

  if (isLink) $('attr-href').value = target.getAttribute('href') || '';
  if (isImg) {
    $('attr-src').value = target.getAttribute('src') || '';
    $('attr-alt').value = target.getAttribute('alt') || '';
  }
});

/* ---------- save ---------- */

function serializeCleanHtml() {
  const iframe = $('html-editor');
  const liveDoc = iframe.contentDocument;
  if (!liveDoc || !liveDoc.documentElement) return null;

  const clone = liveDoc.documentElement.cloneNode(true);

  // Remove everything the editor injected.
  clone.querySelectorAll('[data-cms-injected]').forEach((el) => el.remove());

  // Put back the page's own CSP <meta> tags.
  clone.querySelectorAll('[data-cms-orig-http-equiv]').forEach((el) => {
    el.setAttribute('http-equiv', el.getAttribute('data-cms-orig-http-equiv'));
    el.removeAttribute('data-cms-orig-http-equiv');
  });

  // Only strip contenteditable where the editor added it.
  clone.querySelectorAll('[data-cms-active]').forEach((el) => el.removeAttribute('contenteditable'));

  clone.querySelectorAll('*').forEach((el) => {
    el.removeAttribute('data-cms-hover');
    el.removeAttribute('data-cms-active');
    if (el.getAttribute('class') === '') el.removeAttribute('class');
    if (el.getAttribute('style') === '') el.removeAttribute('style');
  });

  const doctype = iframe.dataset.doctype || '<!DOCTYPE html>';
  return `${doctype}\n${clone.outerHTML}\n`;
}

async function saveCurrentFile() {
  // Remember which file we are saving: the user may click another file while the request is running.
  const file = currentFile;
  if (!file || (file.type !== 'html' && file.type !== 'text')) return;

  const rawContent = file.type === 'html' ? serializeCleanHtml() : $('text-editor').value;
  if (rawContent === null) return setStatus('Preview is not ready yet', true);

  setStatus('Saving...');
  $('save-btn').disabled = true; // no double saves while the request is running

  try {
    const res = await ghFetch(`/contents/${encPath(file.path)}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `admin: update ${file.path}`,
        content: toBase64(rawContent),
        sha: file.sha,
        branch: cfg.branch
      })
    });

    if (!res.ok) {
      const f = await describeFailure(res, 'Save');
      return setStatus(f.text, true);
    }

    const data = await res.json();
    if (!data.content || !data.content.sha) throw new Error('Save may have worked, but GitHub sent an unexpected reply. Re-open the file to check.');

    file.sha = data.content.sha; // next save must use the new sha
    cacheBlob(data.content.sha, textToBuffer(rawContent)); // re-opening this version needs no download
    upsertEntry(file.path, data.content.sha, data.content.size);
    setStatus(currentFile === file ? 'Saved & committed!' : `Saved & committed ${file.path}`);
  } finally {
    // Re-enable (also after an error so you can retry), but only if this file is still the open one.
    if (currentFile === file) $('save-btn').disabled = false;
  }
}

/* ---------- create / upload / delete ---------- */

async function createNewFile() {
  const where = cfg.root ? `/${cfg.root}` : 'the repo root';
  const relPath = (prompt(`File path inside ${where} (e.g. contact.html or notes.txt):`) || '').trim();
  if (!relPath) return;
  if (relPath.split('/').includes('..')) return setStatus('Invalid path', true);
  const path = fullPath(relPath);
  if (shaByPath.has(path)) return setStatus(`${path} already exists`, true);

  const isHtml = /\.html?$/i.test(path);
  const starter = isHtml
    ? `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>New Page</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>New Page</h1>\n  <p>Click here to edit text.</p>\n</body>\n</html>\n`
    : '';

  setStatus(`Creating ${path}...`);
  const res = await ghFetch(`/contents/${encPath(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `admin: create ${path}`,
      content: toBase64(starter),
      branch: cfg.branch
    })
  });

  if (!res.ok) {
    const f = await describeFailure(res, 'Create');
    // Creating without a sha on an existing path comes back as 422 "sha wasn't supplied".
    return setStatus(f.conflict ? `${path} already exists (it may have been added elsewhere)` : f.text, true);
  }

  const data = await res.json();
  cacheBlob(data.content.sha, textToBuffer(starter));
  upsertEntry(path, data.content.sha, data.content.size);
  openFile(path); // not awaited on purpose: it reports its own errors and releases the busy lock sooner
}

async function uploadImageFile(file) {
  const subPath = (prompt('Save image as:', file.name) || '').trim();
  if (!subPath) return;
  if (subPath.split('/').includes('..')) return setStatus('Invalid path', true);
  const path = fullPath(subPath);

  setStatus(`Uploading ${path}...`);
  const b64 = await fileToBase64(file);

  // We already know the sha of every file in the list; only ask GitHub when the path isn't in it.
  let existingSha = shaByPath.get(path);
  if (!existingSha) {
    const check = await ghFetch(`/contents/${encPath(path)}?ref=${encodeURIComponent(cfg.branch)}`, {
      cache: 'no-store'
    });
    if (check.ok) {
      existingSha = (await check.json()).sha;
    } else if (check.status !== 404) {
      // 404 just means "new file". Anything else is a real problem (bad token, rate limit, ...).
      const f = await describeFailure(check, 'Upload');
      return setStatus(f.text, true);
    }
  }

  const res = await ghFetch(`/contents/${encPath(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `admin: upload ${path}`,
      content: b64,
      ...(existingSha ? { sha: existingSha } : {}),
      branch: cfg.branch
    })
  });

  if (!res.ok) {
    const f = await describeFailure(res, 'Upload');
    return setStatus(f.text, true);
  }

  const data = await res.json();
  upsertEntry(path, data.content.sha, data.content.size);
  openFile(path);
}

async function deleteCurrentFile() {
  const file = currentFile;
  if (!file) return;
  if (!confirm(`Delete ${file.path}?`)) return;

  setStatus(`Deleting ${file.path}...`);
  const res = await ghFetch(`/contents/${encPath(file.path)}`, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `admin: delete ${file.path}`,
      sha: file.sha,
      branch: cfg.branch
    })
  });

  // 404 means it is already gone on GitHub, so treat it as deleted and clean up locally.
  if (!res.ok && res.status !== 404) {
    const f = await describeFailure(res, 'Delete');
    return setStatus(f.text, true);
  }

  openSeq++; // cancel any in-flight open
  removeEntry(file.path);
  if (currentFile === file) {
    currentFile = null;
    selectedMediaEl = null;
    $('current-path').textContent = 'Select a file from /src';
    $('save-btn').disabled = true;
    $('delete-btn').disabled = true;
    showEditor(null);
    $('attr-panel').classList.add('hidden');
  }
  setStatus(res.status === 404 ? 'File was already deleted on GitHub' : 'Deleted');
}

init();
