const TOKEN_KEY = 'blackhole_cms_pat';
let cfg = null;
let currentFile = null;
let selectedMediaEl = null;

const $ = (id) => document.getElementById(id);

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
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

function setStatus(msg, isError = false) {
  const el = $('status-msg');
  el.textContent = msg;
  el.style.color = isError ? '#dc2626' : '#4b5563';
}

async function ghFetch(endpoint, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  return fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${endpoint}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
}

async function init() {
  cfg = await fetch('config.json').then((r) => r.json());
  if (!cfg.siteUrl.endsWith('/')) cfg.siteUrl += '/';

  $('login-btn').onclick = () => {
    const val = $('pat-input').value.trim();
    if (!val) return;
    localStorage.setItem(TOKEN_KEY, val);
    $('pat-input').value = '';
    $('login-screen').classList.add('hidden');
    loadTree();
  };

  $('logout-btn').onclick = () => {
    localStorage.removeItem(TOKEN_KEY);
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

  if (!localStorage.getItem(TOKEN_KEY)) {
    $('login-screen').classList.remove('hidden');
  } else {
    loadTree();
  }
}

async function loadTree() {
  setStatus('Loading file tree...');
  const res = await ghFetch(`/git/trees/${cfg.branch}?recursive=1`);
  if (!res.ok) {
    setStatus('Failed to load repo tree. Check token or config.json.', true);
    if (res.status === 401) $('login-screen').classList.remove('hidden');
    return;
  }
  const data = await res.json();
  const prefix = cfg.root ? `${cfg.root}/` : '';
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
  setStatus('Ready');
}

async function openFile(path) {
  setStatus(`Opening ${path}...`);
  $('attr-panel').classList.add('hidden');
  selectedMediaEl = null;

  const res = await ghFetch(`/contents/${encodeURIComponent(path)}?ref=${cfg.branch}`);
  if (!res.ok) return setStatus('Error fetching file', true);
  const data = await res.json();

  const ext = path.split('.').pop().toLowerCase();
  const isHtml = ext === 'html' || ext === 'htm';
  const isImg = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext);

  currentFile = { path: data.path, sha: data.sha, type: isHtml ? 'html' : isImg ? 'img' : 'text' };

  document.querySelectorAll('#file-tree li').forEach((li) => {
    li.classList.toggle('active', li.dataset.path === path);
  });

  $('current-path').textContent = path;
  $('delete-btn').disabled = false;
  $('save-btn').disabled = isImg;

  $('html-editor').classList.toggle('hidden', !isHtml);
  $('text-editor').classList.toggle('hidden', currentFile.type !== 'text');
  $('image-preview').classList.toggle('hidden', !isImg);

  if (isHtml) {
    renderHtmlInIframe(fromBase64(data.content));
  } else if (isImg) {
    $('preview-img').src = data.download_url;
  } else {
    $('text-editor').value = fromBase64(data.content);
  }
  setStatus('Loaded');
}

function renderHtmlInIframe(rawHtml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  const dt = doc.doctype;
  const doctypeStr = dt
    ? `<!DOCTYPE ${dt.name}${dt.publicId ? ` PUBLIC "${dt.publicId}"` : ''}${dt.systemId ? ` "${dt.systemId}"` : ''}>`
    : '<!DOCTYPE html>';

  const base = doc.createElement('base');
  base.href = cfg.siteUrl;
  base.setAttribute('data-cms-injected', 'true');
  doc.head.insertBefore(base, doc.head.firstChild);

  const style = doc.createElement('style');
  style.setAttribute('data-cms-injected', 'true');
  style.textContent = `
    [data-cms-hover] { outline: 2px dashed #3b82f6 !important; outline-offset: 2px !important; }
    [data-cms-active] { outline: 2px solid #2563eb !important; outline-offset: 2px !important; }
  `;
  doc.head.appendChild(style);

  const script = doc.createElement('script');
  script.setAttribute('data-cms-injected', 'true');
  script.textContent = `
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
  doc.body.appendChild(script);

  const iframe = $('html-editor');
  iframe.dataset.doctype = doctypeStr;
  iframe.srcdoc = `${doctypeStr}\n${doc.documentElement.outerHTML}`;
}

window.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'CMS_SELECT') return;
  const iframeWin = $('html-editor').contentWindow;
  const target = iframeWin ? iframeWin.__cmsMediaTarget : null;
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

function serializeCleanHtml() {
  const iframe = $('html-editor');
  const clone = iframe.contentDocument.documentElement.cloneNode(true);

  clone.querySelectorAll('[data-cms-injected]').forEach((el) => el.remove());

  const ATTRS_TO_REMOVE = ['data-cms-hover', 'data-cms-active', 'contenteditable', 'spellcheck'];
  clone.querySelectorAll('*').forEach((el) => {
    ATTRS_TO_REMOVE.forEach((attr) => el.removeAttribute(attr));
    if (el.getAttribute('class') === '') el.removeAttribute('class');
    if (el.getAttribute('style') === '') el.removeAttribute('style');
  });

  const doctype = iframe.dataset.doctype || '<!DOCTYPE html>';
  return `${doctype}\n${clone.outerHTML}\n`;
}

async function saveCurrentFile() {
  if (!currentFile || currentFile.type === 'img') return;
  setStatus('Saving...');

  const rawContent = currentFile.type === 'html' ? serializeCleanHtml() : $('text-editor').value;

  const res = await ghFetch(`/contents/${encodeURIComponent(currentFile.path)}`, {
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

async function createNewFile() {
  const relPath = prompt('File path inside /src (e.g. contact.html or notes.txt):');
  if (!relPath) return;
  const fullPath = `${cfg.root}/${relPath.replace(/^\/+/, '')}`;
  const isHtml = fullPath.endsWith('.html') || fullPath.endsWith('.htm');
  const starter = isHtml
    ? `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>New Page</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>New Page</h1>\n  <p>Click here to edit text.</p>\n</body>\n</html>\n`
    : '';

  setStatus(`Creating ${fullPath}...`);
  const res = await ghFetch(`/contents/${encodeURIComponent(fullPath)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `admin: update ${fullPath}`,
      content: toBase64(starter),
      branch: cfg.branch
    })
  });

  if (!res.ok) return setStatus('Could not create file', true);
  await loadTree();
  openFile(fullPath);
}

async function uploadImageFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const subPath = prompt('Save image under /src as:', file.name);
  if (!subPath) return;
  const fullPath = `${cfg.root}/${subPath.replace(/^\/+/, '')}`;

  setStatus(`Uploading ${fullPath}...`);
  const b64 = await fileToBase64(file);

  let existingSha;
  const check = await ghFetch(`/contents/${encodeURIComponent(fullPath)}?ref=${cfg.branch}`);
  if (check.ok) {
    const existing = await check.json();
    existingSha = existing.sha;
  }

  const res = await ghFetch(`/contents/${encodeURIComponent(fullPath)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `admin: update ${fullPath}`,
      content: b64,
      ...(existingSha ? { sha: existingSha } : {}),
      branch: cfg.branch
    })
  });

  if (!res.ok) return setStatus('Upload failed', true);
  await loadTree();
  openFile(fullPath);
}

async function deleteCurrentFile() {
  if (!currentFile) return;
  if (!confirm(`Delete ${currentFile.path}?`)) return;

  setStatus(`Deleting ${currentFile.path}...`);
  const res = await ghFetch(`/contents/${encodeURIComponent(currentFile.path)}`, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `admin: update ${currentFile.path}`,
      sha: currentFile.sha,
      branch: cfg.branch
    })
  });

  if (res.status === 409) {
    return setStatus('SHA conflict', true);
  }
  if (!res.ok) return setStatus('Delete failed', true);

  currentFile = null;
  $('current-path').textContent = 'Select a file from /src';
  $('save-btn').disabled = true;
  $('delete-btn').disabled = true;
  $('html-editor').classList.add('hidden');
  $('text-editor').classList.add('hidden');
  $('image-preview').classList.add('hidden');
  $('attr-panel').classList.add('hidden');

  await loadTree();
  setStatus('Deleted');
}

init();
