// Name of the sessionStorage entry that holds the PAT.
// This is only a label. NEVER put the token itself here.
const TOKEN_KEY = 'cms_github_pat';
const store = window.sessionStorage; // cleared when the tab closes

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico']);
const TEXT_EXTS = new Set(['txt', 'md', 'css', 'js', 'mjs', 'json', 'xml', 'csv', 'yml', 'yaml', 'toml']);

let cfg = null;
let currentFile = null;
let selectedMediaEl = null;
let openSeq = 0; // guards against out-of-order responses when clicking files quickly

const $ = (id) => document.getElementById(id);

/* ---------- helpers ---------- */

// Encode each path segment but keep the slashes (the contents API rejects %2F).
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
const rootPrefix = () => (cfg.root ? `${cfg.root}/` : '');
const fullPath = (rel) => [cfg.root, rel.replace(/^\/+/, '')].filter(Boolean).join('/');

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileKind(path) {
  const name = path.split('/').pop();
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (IMAGE_EXTS.has(ext)) return 'img';
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

// Reads a file's text. Files over 1 MB come back from the contents API with
// empty content, so fall back to the blob API instead of showing an empty
// editor (which would wipe the file on save).
async function readText(data) {
  let b64 = data.content;
  if (!b64 && data.size > 0) {
    const r = await ghFetch(`/git/blobs/${data.sha}`);
    if (!r.ok) throw new Error('Could not read file contents');
    b64 = (await r.json()).content;
  }
  return fromBase64(b64 || '');
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

  cfg = await fetch('config.json').then((r) => r.json());
  cfg.root = (cfg.root || '').replace(/^\/+|\/+$/g, '');
  if (!cfg.siteUrl.endsWith('/')) cfg.siteUrl += '/';

  $('login-form').onsubmit = (e) => {
    e.preventDefault(); // otherwise the form reloads the page
    const val = $('pat-input').value.trim();
    if (!val) return;
    store.setItem(TOKEN_KEY, val);
    $('pat-input').value = '';
    $('login-screen').classList.add('hidden');
    loadTree();
  };

  $('logout-btn').onclick = () => {
    store.removeItem(TOKEN_KEY);
    location.reload();
  };

  $('new-btn').onclick = createNewFile;
  $('upload-input').onchange = uploadImageFile;
  $('save-btn').onclick = saveCurrentFile;
  $('delete-btn').onclick = deleteCurrentFile;

  ['href', 'src', 'alt'].forEach((attr) => {
    $(`attr-${attr}`).oninput = (e) => {
      if (selectedMediaEl) selectedMediaEl.setAttribute(attr, e.target.value);
    };
  });

  if (!store.getItem(TOKEN_KEY)) {
    showLogin();
  } else {
    loadTree();
  }
}

/* ---------- file tree ---------- */

async function loadTree() {
  setStatus('Loading file tree...');
  const res = await ghFetch(`/git/trees/${cfg.branch}?recursive=1`);
  if (!res.ok) {
    setStatus('Failed to load repo tree. Check token or config.json.', true);
    return; // ghFetch already shows the login screen on 401
  }
  const data = await res.json();
  const prefix = rootPrefix();
  const files = data.tree.filter((item) => item.type === 'blob' && item.path.startsWith(prefix));

  const ul = $('file-tree');
  ul.innerHTML = '';
  files.forEach((f) => {
    const li = document.createElement('li');
    li.textContent = f.path.slice(prefix.length);
    li.dataset.path = f.path;
    if (currentFile && currentFile.path === f.path) li.classList.add('active');
    li.onclick = () => openFile(f.path);
    ul.appendChild(li);
  });
  setStatus(data.truncated ? 'Ready (repo is large: file list is truncated)' : 'Ready');
}

/* ---------- open / render ---------- */

async function openFile(path) {
  const seq = ++openSeq;
  setStatus(`Opening ${path}...`);
  $('attr-panel').classList.add('hidden');
  selectedMediaEl = null;

  const res = await ghFetch(`/contents/${encPath(path)}?ref=${encodeURIComponent(cfg.branch)}`);
  if (seq !== openSeq) return;
  if (!res.ok) return setStatus('Error fetching file', true);
  const data = await res.json();

  const kind = fileKind(path);
  let text = null;
  if (kind === 'html' || kind === 'text') {
    try {
      text = await readText(data);
    } catch (err) {
      if (seq === openSeq) setStatus(err.message, true);
      return;
    }
    if (seq !== openSeq) return;
  }

  currentFile = { path: data.path, sha: data.sha, type: kind };

  document.querySelectorAll('#file-tree li').forEach((li) => {
    li.classList.toggle('active', li.dataset.path === path);
  });

  $('current-path').textContent = path;
  $('delete-btn').disabled = false;
  $('save-btn').disabled = true; // enabled below once the content is actually loaded

  if (kind === 'html') {
    showEditor('html');
    const iframe = $('html-editor');
    // Don't allow saving until the iframe has finished loading, otherwise we'd serialize an empty doc.
    iframe.onload = () => {
      if (seq === openSeq) $('save-btn').disabled = false;
    };
    renderHtmlInIframe(text, path);
    setStatus('Loaded');
  } else if (kind === 'text') {
    showEditor('text');
    $('text-editor').value = text;
    $('save-btn').disabled = false;
    setStatus('Loaded');
  } else if (kind === 'img') {
    showEditor('img');
    $('preview-img').src = data.download_url;
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
  if (!currentFile || (currentFile.type !== 'html' && currentFile.type !== 'text')) return;

  const rawContent = currentFile.type === 'html' ? serializeCleanHtml() : $('text-editor').value;
  if (rawContent === null) return setStatus('Preview is not ready yet', true);

  setStatus('Saving...');
  const res = await ghFetch(`/contents/${encPath(currentFile.path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `admin: update ${currentFile.path}`,
      content: toBase64(rawContent),
      sha: currentFile.sha,
      branch: cfg.branch
    })
  });

  if (res.status === 409 || res.status === 422) {
    setStatus('SHA conflict: File was modified externally. Reload the file before saving.', true);
    alert('SHA Conflict: Re-open the file from the left panel to fetch the latest version.');
    return;
  }

  if (!res.ok) return setStatus('Save failed', true);

  const data = await res.json();
  currentFile.sha = data.content.sha;
  setStatus('Saved & committed!');
}

/* ---------- create / upload / delete ---------- */

async function createNewFile() {
  const relPath = prompt('File path inside /src (e.g. contact.html or notes.txt):');
  if (!relPath) return;
  const path = fullPath(relPath);
  const isHtml = path.endsWith('.html') || path.endsWith('.htm');
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

  if (!res.ok) return setStatus('Could not create file (does it already exist?)', true);
  await loadTree();
  openFile(path);
}

async function uploadImageFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const subPath = prompt('Save image under /src as:', file.name);
  if (!subPath) return;
  const path = fullPath(subPath);

  setStatus(`Uploading ${path}...`);
  const b64 = await fileToBase64(file);

  let existingSha;
  const check = await ghFetch(`/contents/${encPath(path)}?ref=${encodeURIComponent(cfg.branch)}`);
  if (check.ok) {
    const existing = await check.json();
    existingSha = existing.sha;
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

  if (!res.ok) return setStatus('Upload failed', true);
  await loadTree();
  openFile(path);
}

async function deleteCurrentFile() {
  if (!currentFile) return;
  if (!confirm(`Delete ${currentFile.path}?`)) return;

  setStatus(`Deleting ${currentFile.path}...`);
  const res = await ghFetch(`/contents/${encPath(currentFile.path)}`, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `admin: delete ${currentFile.path}`,
      sha: currentFile.sha,
      branch: cfg.branch
    })
  });

  if (res.status === 409) {
    return setStatus('SHA conflict', true);
  }
  if (!res.ok) return setStatus('Delete failed', true);

  openSeq++; // cancel any in-flight open
  currentFile = null;
  selectedMediaEl = null;
  $('current-path').textContent = 'Select a file from /src';
  $('save-btn').disabled = true;
  $('delete-btn').disabled = true;
  showEditor(null);
  $('attr-panel').classList.add('hidden');

  await loadTree();
  setStatus('Deleted');
}

init();
