// Name of the sessionStorage entry that holds the PAT.
// This is only a label. NEVER put the token itself here.
const TOKEN_KEY = 'cms_github_pat';
const FILTER_KEY = 'cms_filter_html_only';
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
const PREFETCH_MAX_FILES = 40;
const PREFETCH_MAX_BYTES = 256 * 1024;
const PREFETCH_WORKERS = 3;
const HOVER_PREFETCH_DELAY_MS = 120;
const REVALIDATE_AFTER_MS = 30 * 1000;

let cfg = null;
let currentFile = null;
let selectedBlockEl = null; // Currently active block inside iframe
let selectedMediaEl = null; // Currently active <a> or <img> inside iframe
let openSeq = 0;
let previewUrl = null;
let iframeBlobUrls = []; // Local blob URLs created for instant repo image previews
let isDirty = false;
let deployPollTimer = null;

// File tree state
let treeEntries = []; // [{ path, sha, size }]
const shaByPath = new Map();
let treePromise = null;
let treeFresh = false;
let lastTreeCheck = 0;
let prefetchGen = 0;
let hoverTimer = null;

// Content-addressed blob cache (keyed by sha)
const blobCache = new Map();
const blobInflight = new Map();
let blobCacheBytes = 0;

const $ = (id) => document.getElementById(id);

/* ---------- helpers ---------- */

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
  return 'binary';
}

// Normalize a relative path against a directory inside the repo
function resolveRepoPath(baseDir, relUrl) {
  if (!relUrl || /^[a-z]+:/i.test(relUrl) || relUrl.startsWith('//') || relUrl.startsWith('#') || relUrl.startsWith('data:')) {
    return null;
  }
  const cleanRel = relUrl.split('?')[0].split('#')[0];
  let combined;
  if (cleanRel.startsWith('/')) {
    combined = fullPath(cleanRel.slice(1));
  } else {
    combined = fullPath(baseDir + cleanRel);
  }
  const parts = [];
  for (const seg of combined.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

// Compute a relative path from the currently open HTML file to a target repo path
function makeRelativePath(fromFilePath, toRepoPath) {
  const prefix = rootPrefix();
  const fromRel = fromFilePath.startsWith(prefix) ? fromFilePath.slice(prefix.length) : fromFilePath;
  const toRel = toRepoPath.startsWith(prefix) ? toRepoPath.slice(prefix.length) : toRepoPath;

  const fromParts = fromRel.split('/').slice(0, -1);
  const toParts = toRel.split('/');

  let common = 0;
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++;
  }
  const up = Array(fromParts.length - common).fill('..');
  const down = toParts.slice(common);
  return [...up, ...down].join('/');
}

function setDirty(val) {
  isDirty = Boolean(val);
  const badge = $('dirty-indicator');
  if (badge) badge.classList.toggle('hidden', !isDirty);
}

function setStatus(msg, isError = false) {
  const el = $('status-msg');
  el.textContent = msg;
  el.style.color = isError ? '#f87171' : '#94a3b8';
}

function showLogin() {
  $('login-screen').classList.remove('hidden');
  $('pat-input').focus();
}

function showEditor(kind) {
  $('html-editor').classList.toggle('hidden', kind !== 'html');
  $('text-editor').classList.toggle('hidden', kind !== 'text');
  $('image-preview').classList.toggle('hidden', kind !== 'img');
  $('page-meta-btn').classList.toggle('hidden', kind !== 'html');
}

function clearIframeBlobUrls() {
  iframeBlobUrls.forEach((u) => URL.revokeObjectURL(u));
  iframeBlobUrls = [];
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

async function describeFailure(res, action) {
  let detail = '';
  try {
    detail = String((await res.json()).message || '');
  } catch (_) {}
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
    text = `${action} failed: no permission (token needs Contents: Read & Write).`;
  } else if (status === 404) {
    text = `${action} failed: not found (check config.json and token access).`;
  } else if (status === 422) {
    text = `${action} failed: ${detail || 'GitHub rejected the request'}`;
  } else if (status >= 500) {
    text = `${action} failed: GitHub server error (${status}).`;
  } else {
    text = `${action} failed (${status})${detail ? `: ${detail}` : ''}`;
  }
  return { text, conflict, status, detail };
}

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

/* ---------- blob cache (instant re-opens, prefetch, local image preview) ---------- */

function getCachedBlob(sha) {
  const buf = blobCache.get(sha);
  if (buf) {
    blobCache.delete(sha);
    blobCache.set(sha, buf);
  }
  return buf;
}

function cacheBlob(sha, buf) {
  if (!sha || blobCache.has(sha)) return;
  if (buf.byteLength > BLOB_CACHE_MAX_BYTES) return;
  blobCache.set(sha, buf);
  blobCacheBytes += buf.byteLength;
  for (const [key, val] of blobCache) {
    if (blobCacheBytes <= BLOB_CACHE_MAX_BYTES) break;
    if (key === sha) continue;
    blobCache.delete(key);
    blobCacheBytes -= val.byteLength;
  }
}

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

async function startPrefetch() {
  const gen = ++prefetchGen;
  const rank = (f) => (fileKind(f.path) === 'html' ? 0 : 1);
  const queue = treeEntries
    .filter((f) => {
      const k = fileKind(f.path);
      return (k === 'html' || k === 'text' || k === 'img') && f.size > 0 && f.size <= PREFETCH_MAX_BYTES && !blobCache.has(f.sha);
    })
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, PREFETCH_MAX_FILES);

  const worker = async () => {
    while (queue.length && gen === prefetchGen) {
      const f = queue.shift();
      try {
        await fetchBlob(f.sha);
      } catch (_) {}
    }
  };
  await Promise.all(Array.from({ length: PREFETCH_WORKERS }, worker));
}

function hoverPrefetch(path) {
  clearTimeout(hoverTimer);
  const kind = fileKind(path);
  if (kind === 'binary') return;
  hoverTimer = setTimeout(() => {
    const sha = shaByPath.get(path);
    if (sha) fetchBlob(sha).catch(() => {});
  }, HOVER_PREFETCH_DELAY_MS);
}

/* ---------- Feature 7: Live GitHub Actions Deployment Status ---------- */

function pollDeploymentStatus() {
  clearTimeout(deployPollTimer);
  const dot = $('deploy-dot');
  if (dot) {
    dot.className = 'dot deploying';
    dot.title = 'GitHub Pages deployment in progress...';
  }
  let attempts = 0;

  const check = async () => {
    attempts++;
    try {
      const res = await ghFetch('/actions/runs?per_page=1', { cache: 'no-store' });
      if (!res.ok) {
        if (dot) dot.className = 'dot';
        return;
      }
      const data = await res.json();
      const run = data.workflow_runs && data.workflow_runs[0];
      if (!run) {
        if (dot) dot.className = 'dot';
        return;
      }
      if (run.status === 'completed') {
        if (run.conclusion === 'success') {
          if (dot) {
            dot.className = 'dot';
            dot.title = 'Live on GitHub Pages';
          }
          setStatus('Saved & deployed live to GitHub Pages!');
        } else {
          if (dot) {
            dot.className = 'dot error';
            dot.title = `Deployment ${run.conclusion}`;
          }
          setStatus(`Saved, but Pages deploy ${run.conclusion}`, true);
        }
        return;
      }
      setStatus(`Saved — Deploying to Pages (${run.status})...`);
    } catch (_) {}
    if (attempts < 20) {
      deployPollTimer = setTimeout(check, 5000);
    } else if (dot) {
      dot.className = 'dot';
    }
  };

  deployPollTimer = setTimeout(check, 3500);
}

/* ---------- init ---------- */

async function init() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('github_pat_'))
      .forEach((k) => localStorage.removeItem(k));
  } catch (_) {}

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

  // Restore saved .html filter preference
  const filterCheckbox = $('filter-html-checkbox');
  if (filterCheckbox) {
    try {
      filterCheckbox.checked = localStorage.getItem(FILTER_KEY) === '1';
    } catch (_) {}
    filterCheckbox.onchange = () => {
      try {
        localStorage.setItem(FILTER_KEY, filterCheckbox.checked ? '1' : '0');
      } catch (_) {}
      renderTree();
    };
  }

  $('login-form').onsubmit = (e) => {
    e.preventDefault();
    const val = $('pat-input').value.trim();
    if (!val) return;
    store.setItem(TOKEN_KEY, val);
    $('pat-input').value = '';
    $('login-screen').classList.add('hidden');
    bootTree().catch((err) => setStatus(err.message || 'Failed to load repo tree', true));
  };

  $('logout-btn').onclick = () => {
    if (isDirty && !confirm('You have unsaved changes. Disconnect anyway?')) return;
    store.removeItem(TOKEN_KEY);
    try {
      localStorage.removeItem(treeCacheKey());
    } catch (_) {}
    location.reload();
  };

  $('new-btn').onclick = () => guarded(createNewFile);
  $('save-btn').onclick = () => guarded(saveCurrentFile);
  $('delete-btn').onclick = () => guarded(deleteCurrentFile);
  $('upload-input').onchange = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) guarded(() => uploadImageFile(file));
  };

  // Feature 1: Track dirty state in plain text editor
  $('text-editor').addEventListener('input', () => setDirty(true));

  // Warn before closing tab with unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Feature 3: Keyboard shortcut Cmd/Ctrl + S
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!$('save-btn').disabled) guarded(saveCurrentFile);
    }
  });

  // Attribute inspector live bindings
  $('attr-href').oninput = (e) => {
    if (selectedMediaEl && selectedMediaEl.tagName === 'A') {
      selectedMediaEl.setAttribute('href', e.target.value);
      setDirty(true);
    }
  };

  $('attr-src').oninput = (e) => {
    if (selectedMediaEl && selectedMediaEl.tagName === 'IMG') {
      applyImageSrcInIframe(selectedMediaEl, e.target.value);
      setDirty(true);
    }
  };

  $('attr-src-select').onchange = (e) => {
    if (e.target.value && selectedMediaEl && selectedMediaEl.tagName === 'IMG') {
      $('attr-src').value = e.target.value;
      applyImageSrcInIframe(selectedMediaEl, e.target.value);
      setDirty(true);
    }
  };

  $('attr-alt').oninput = (e) => {
    if (selectedMediaEl && selectedMediaEl.tagName === 'IMG') {
      selectedMediaEl.setAttribute('alt', e.target.value);
      setDirty(true);
    }
  };

  // Feature 5: Duplicate & Remove Block buttons
  $('dup-block-btn').onclick = () => {
    if (!selectedBlockEl || selectedBlockEl === selectedBlockEl.ownerDocument.body) return;
    const clone = selectedBlockEl.cloneNode(true);
    clone.removeAttribute('data-cms-active');
    clone.removeAttribute('data-cms-hover');
    clone.removeAttribute('contenteditable');
    selectedBlockEl.after(clone);
    setDirty(true);
    setStatus('Duplicated element');
  };

  $('del-block-btn').onclick = () => {
    if (!selectedBlockEl || selectedBlockEl === selectedBlockEl.ownerDocument.body) return;
    selectedBlockEl.remove();
    selectedBlockEl = null;
    selectedMediaEl = null;
    $('attr-panel').classList.add('hidden');
    setDirty(true);
    setStatus('Removed element');
  };

  // Feature 6: Page SEO (<title> & <meta name="description">) modal
  $('page-meta-btn').onclick = openPageMetaModal;
  $('meta-cancel-btn').onclick = () => $('meta-modal').classList.add('hidden');
  $('meta-apply-btn').onclick = applyPageMetaModal;

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

/* ---------- Feature 6: Page SEO Modal ---------- */

function openPageMetaModal() {
  const doc = $('html-editor').contentDocument;
  if (!doc) return;
  $('meta-title-input').value = doc.title || '';
  const descMeta = doc.querySelector('meta[name="description" i]');
  $('meta-desc-input').value = descMeta ? descMeta.getAttribute('content') || '' : '';
  $('meta-modal').classList.remove('hidden');
  $('meta-title-input').focus();
}

function applyPageMetaModal() {
  const doc = $('html-editor').contentDocument;
  if (!doc) return;
  doc.title = $('meta-title-input').value.trim();
  const descVal = $('meta-desc-input').value.trim();
  let descMeta = doc.querySelector('meta[name="description" i]');
  if (descVal) {
    if (!descMeta) {
      descMeta = doc.createElement('meta');
      descMeta.setAttribute('name', 'description');
      doc.head.appendChild(descMeta);
    }
    descMeta.setAttribute('content', descVal);
  } else if (descMeta) {
    descMeta.remove();
  }
  $('meta-modal').classList.add('hidden');
  setDirty(true);
  setStatus('Updated page title & meta description');
}

/* ---------- file tree ---------- */

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
  } catch (_) {}
  return loadTree();
}

function applyTree(entries, persist = true) {
  const sorted = [...entries].sort(byPath);
  treeEntries = sorted;
  shaByPath.clear();
  sorted.forEach((e) => shaByPath.set(e.path, e.sha));

  renderTree();
  populateAssetPickers();

  if (persist) {
    try {
      localStorage.setItem(treeCacheKey(), JSON.stringify(sorted));
    } catch (_) {}
  }
}

function renderTree() {
  const prefix = rootPrefix();
  const ul = $('file-tree');
  ul.innerHTML = '';

  const filterCheckbox = $('filter-html-checkbox');
  const onlyHtml = filterCheckbox ? filterCheckbox.checked : false;

  const filteredEntries = treeEntries.filter((f) => {
    if (!onlyHtml) return true;
    const ext = extOf(f.path);
    return ext === 'html' || ext === 'htm';
  });

  filteredEntries.forEach((f) => {
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

// Feature 4: Populate image & link pickers from repo tree
function populateAssetPickers() {
  const imgList = $('repo-images-datalist');
  const linkList = $('repo-links-datalist');
  const imgSelect = $('attr-src-select');
  if (!imgList || !linkList || !imgSelect) return;

  imgList.innerHTML = '';
  linkList.innerHTML = '';
  imgSelect.innerHTML = '<option value="">— Choose repo image —</option>';

  const fromPath = currentFile ? currentFile.path : fullPath('index.html');

  treeEntries.forEach((f) => {
    const k = fileKind(f.path);
    const rel = makeRelativePath(fromPath, f.path);
    if (k === 'img') {
      const opt1 = document.createElement('option');
      opt1.value = rel;
      imgList.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = rel;
      opt2.textContent = rel;
      imgSelect.appendChild(opt2);
    } else if (k === 'html') {
      const opt = document.createElement('option');
      opt.value = rel;
      linkList.appendChild(opt);
    }
  });
}

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
    res = await ghFetch(`/git/trees/${cfg.branch}?recursive=1`, { cache: 'no-cache' });
  } catch (_) {
    res = null;
  }

  if (!res || !res.ok) {
    let msg;
    if (!res) {
      msg = treeEntries.length
        ? 'Could not reach GitHub (showing last known list)'
        : 'Could not reach GitHub. Check your connection.';
    } else if (res.status === 401) {
      msg = 'Token invalid or expired. Please log in again.';
    } else {
      msg = treeEntries.length
        ? `Could not refresh file list (${res.status}, showing last known copy)`
        : `Failed to load repo tree (${res.status}).`;
    }
    setStatus(msg, true);
    return;
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
  if (isDirty && currentFile && currentFile.path !== path) {
    if (!confirm(`Discard unsaved changes to ${currentFile.path}?`)) return;
  }

  const seq = ++openSeq;
  setStatus(`Opening ${path}...`);
  $('attr-panel').classList.add('hidden');
  selectedBlockEl = null;
  selectedMediaEl = null;
  setDirty(false);

  const kind = fileKind(path);
  let sha;
  let buf = null;

  try {
    if (!treeFresh && treePromise) {
      await treePromise;
      if (seq !== openSeq) return;
    }

    sha = shaByPath.get(path);
    if (!sha) {
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
      buf = await fetchBlob(sha);
      if (seq !== openSeq) return;
    }
  } catch (err) {
    if (seq === openSeq) {
      setStatus(err instanceof TypeError ? 'Network error: could not reach GitHub' : err.message || 'Error fetching file', true);
    }
    return;
  }

  currentFile = { path, sha, type: kind };
  populateAssetPickers();

  document.querySelectorAll('#file-tree li').forEach((li) => {
    li.classList.toggle('active', li.dataset.path === path);
  });

  $('current-path').textContent = path;
  $('delete-btn').disabled = false;
  $('save-btn').disabled = true;

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  clearIframeBlobUrls();

  if (kind === 'html') {
    showEditor('html');
    const iframe = $('html-editor');
    iframe.onload = () => {
      if (seq !== openSeq) return;
      $('save-btn').disabled = false;
      hydrateRepoAssetsInIframe(iframe.contentDocument, path);
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

/* ---------- Feature 2: Instant Local Blob Resolution for Repo Images & CSS ---------- */

async function applyImageSrcInIframe(imgEl, rawSrc) {
  imgEl.setAttribute('data-cms-orig-src', rawSrc);
  if (!currentFile) {
    imgEl.setAttribute('src', rawSrc);
    return;
  }
  const rel = currentFile.path.slice(rootPrefix().length);
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
  const repoPath = resolveRepoPath(dir, rawSrc);
  const sha = repoPath ? shaByPath.get(repoPath) : null;

  if (sha && IMAGE_MIME[extOf(repoPath)]) {
    try {
      const buf = await fetchBlob(sha);
      const blobUrl = URL.createObjectURL(new Blob([buf], { type: IMAGE_MIME[extOf(repoPath)] }));
      iframeBlobUrls.push(blobUrl);
      imgEl.setAttribute('src', blobUrl);
      return;
    } catch (_) {}
  }
  imgEl.setAttribute('src', rawSrc);
}

async function hydrateRepoAssetsInIframe(liveDoc, pagePath) {
  if (!liveDoc) return;
  const rel = pagePath.slice(rootPrefix().length);
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';

  // Hydrate all relative <img> elements directly from GitHub blob cache so moved/new images work immediately
  const imgs = Array.from(liveDoc.querySelectorAll('img[src]'));
  await Promise.all(
    imgs.map(async (img) => {
      const rawSrc = img.getAttribute('data-cms-orig-src') || img.getAttribute('src');
      await applyImageSrcInIframe(img, rawSrc);
    })
  );

  // Hydrate relative <link rel="stylesheet"> from repo blobs so local CSS changes preview immediately
  const links = Array.from(liveDoc.querySelectorAll('link[rel="stylesheet"][href]'));
  await Promise.all(
    links.map(async (link) => {
      const rawHref = link.getAttribute('data-cms-orig-href') || link.getAttribute('href');
      const repoPath = resolveRepoPath(dir, rawHref);
      const sha = repoPath ? shaByPath.get(repoPath) : null;
      if (sha) {
        try {
          const buf = await fetchBlob(sha);
          const blobUrl = URL.createObjectURL(new Blob([buf], { type: 'text/css' }));
          iframeBlobUrls.push(blobUrl);
          link.setAttribute('data-cms-orig-href', rawHref);
          link.setAttribute('href', blobUrl);
        } catch (_) {}
      }
    })
  );
}

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

  document.addEventListener('input', () => {
    window.parent.postMessage({ type: 'CMS_DIRTY' }, '*');
  });

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
    window.__cmsActiveBlock = active;
    window.__cmsMediaTarget = mediaTarget || null;
    window.parent.postMessage({
      type: 'CMS_SELECT',
      blockTag: active.tagName,
      mediaTag: mediaTarget ? mediaTarget.tagName : null
    }, '*');
  }, true);

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      window.parent.postMessage({ type: 'CMS_SAVE' }, '*');
      return;
    }
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

  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));

  doc.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]').forEach((m) => {
    m.setAttribute('data-cms-orig-http-equiv', m.getAttribute('http-equiv'));
    m.removeAttribute('http-equiv');
  });

  const rel = path.slice(rootPrefix().length);
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
  const base = doc.createElement('base');
  base.href = cfg.siteUrl + encPath(dir);
  base.setAttribute('data-cms-injected', 'true');

  const csp = doc.createElement('meta');
  csp.setAttribute('http-equiv', 'Content-Security-Policy');
  csp.setAttribute('content', `script-src 'nonce-${nonce}'; object-src 'none'`);
  csp.setAttribute('data-cms-injected', 'true');

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

window.addEventListener('message', (e) => {
  const iframeWin = $('html-editor').contentWindow;
  if (!iframeWin || e.source !== iframeWin || !e.data) return;

  if (e.data.type === 'CMS_DIRTY') {
    setDirty(true);
    return;
  }
  if (e.data.type === 'CMS_SAVE') {
    if (!$('save-btn').disabled) guarded(saveCurrentFile);
    return;
  }
  if (e.data.type !== 'CMS_SELECT') return;

  selectedBlockEl = iframeWin.__cmsActiveBlock || null;
  selectedMediaEl = iframeWin.__cmsMediaTarget || null;

  if (!selectedBlockEl) {
    $('attr-panel').classList.add('hidden');
    return;
  }

  $('attr-panel').classList.remove('hidden');
  $('selected-tag').textContent = `<${selectedBlockEl.tagName.toLowerCase()}>`;

  const isLink = Boolean(selectedMediaEl && selectedMediaEl.tagName === 'A');
  const isImg = Boolean(selectedMediaEl && selectedMediaEl.tagName === 'IMG');

  $('href-row').classList.toggle('hidden', !isLink);
  $('src-row').classList.toggle('hidden', !isImg);
  $('img-picker-row').classList.toggle('hidden', !isImg);
  $('alt-row').classList.toggle('hidden', !isImg);

  if (isLink) {
    $('attr-href').value = selectedMediaEl.getAttribute('href') || '';
  }
  if (isImg) {
    const origSrc = selectedMediaEl.getAttribute('data-cms-orig-src') || selectedMediaEl.getAttribute('src') || '';
    $('attr-src').value = origSrc;
    $('attr-src-select').value = origSrc;
    $('attr-alt').value = selectedMediaEl.getAttribute('alt') || '';
  }
});

/* ---------- save ---------- */

function serializeCleanHtml() {
  const iframe = $('html-editor');
  const liveDoc = iframe.contentDocument;
  if (!liveDoc || !liveDoc.documentElement) return null;

  const clone = liveDoc.documentElement.cloneNode(true);

  clone.querySelectorAll('[data-cms-injected]').forEach((el) => el.remove());

  clone.querySelectorAll('[data-cms-orig-http-equiv]').forEach((el) => {
    el.setAttribute('http-equiv', el.getAttribute('data-cms-orig-http-equiv'));
    el.removeAttribute('data-cms-orig-http-equiv');
  });

  // Restore original relative src/href attributes that were swapped to local blob URLs
  clone.querySelectorAll('[data-cms-orig-src]').forEach((el) => {
    el.setAttribute('src', el.getAttribute('data-cms-orig-src'));
    el.removeAttribute('data-cms-orig-src');
  });
  clone.querySelectorAll('[data-cms-orig-href]').forEach((el) => {
    el.setAttribute('href', el.getAttribute('data-cms-orig-href'));
    el.removeAttribute('data-cms-orig-href');
  });

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
  const file = currentFile;
  if (!file || (file.type !== 'html' && file.type !== 'text')) return;

  const rawContent = file.type === 'html' ? serializeCleanHtml() : $('text-editor').value;
  if (rawContent === null) return setStatus('Preview is not ready yet', true);

  setStatus('Saving...');
  $('save-btn').disabled = true;

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
    if (!data.content || !data.content.sha) throw new Error('Save may have worked, but GitHub sent an unexpected reply.');

    file.sha = data.content.sha;
    cacheBlob(data.content.sha, textToBuffer(rawContent));
    upsertEntry(file.path, data.content.sha, data.content.size);
    if (currentFile === file) setDirty(false);
    setStatus(currentFile === file ? 'Saved & committed!' : `Saved & committed ${file.path}`);
    pollDeploymentStatus();
  } finally {
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
    return setStatus(f.conflict ? `${path} already exists` : f.text, true);
  }

  const data = await res.json();
  cacheBlob(data.content.sha, textToBuffer(starter));
  upsertEntry(path, data.content.sha, data.content.size);
  pollDeploymentStatus();
  openFile(path);
}

async function uploadImageFile(file) {
  const subPath = (prompt('Save image under /src as (e.g. resources/' + file.name + '):', file.name) || '').trim();
  if (!subPath) return;
  if (subPath.split('/').includes('..')) return setStatus('Invalid path', true);
  const path = fullPath(subPath);

  setStatus(`Uploading ${path}...`);
  const b64 = await fileToBase64(file);
  const rawBuf = await file.arrayBuffer();

  let existingSha = shaByPath.get(path);
  if (!existingSha) {
    const check = await ghFetch(`/contents/${encPath(path)}?ref=${encodeURIComponent(cfg.branch)}`, {
      cache: 'no-store'
    });
    if (check.ok) {
      existingSha = (await check.json()).sha;
    } else if (check.status !== 404) {
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
  cacheBlob(data.content.sha, rawBuf);
  upsertEntry(path, data.content.sha, data.content.size);
  pollDeploymentStatus();
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

  if (!res.ok && res.status !== 404) {
    const f = await describeFailure(res, 'Delete');
    return setStatus(f.text, true);
  }

  openSeq++;
  removeEntry(file.path);
  if (currentFile === file) {
    currentFile = null;
    selectedBlockEl = null;
    selectedMediaEl = null;
    setDirty(false);
    $('current-path').textContent = 'Select a file from /src';
    $('save-btn').disabled = true;
    $('delete-btn').disabled = true;
    showEditor(null);
    $('attr-panel').classList.add('hidden');
  }
  setStatus(res.status === 404 ? 'File was already deleted on GitHub' : 'Deleted');
  pollDeploymentStatus();
}

init();
