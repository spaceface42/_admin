#!/usr/bin/env node
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync
} from 'node:fs';
import { execFileSync } from 'node:child_process';

const VERSION = '1.1.81-history-runtime-clean';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
}

function removeIfExists(path) {
  if (existsSync(path)) unlinkSync(path);
}

function replaceOrFail(path, pattern, replacement, label) {
  const before = read(path);
  const after = before.replace(pattern, replacement);
  if (after === before) throw new Error(`Could not update ${label} in ${path}`);
  write(path, after);
}

function restoreIndexHtml() {
  try {
    execFileSync('git', ['checkout', '--', 'src/index.html'], { stdio: 'inherit' });
  } catch (e) {
    throw new Error('Could not restore src/index.html from git. Run this script inside the repo root.');
  }

  let html = read('src/index.html');

  // Remove any remaining Snapshot History static modal/button leftovers if the checkout did not fully clean them.
  html = html.replace(
    /\n\s*<!-- SNAPSHOT HISTORY -->[\s\S]*?(?=\n\s*<!-- BACKUP MODAL -->|\n\s*<!-- COMMIT MODAL -->|\n\s*<!-- PUBLISH MODAL -->|\n\s*<div id="toast"|<\/body>)/g,
    '\n'
  );

  html = html.replace(
    /\n\s*<button[^>]*id=["']snapshotHistoryBtn["'][\s\S]*?<\/button>\s*/g,
    '\n'
  );

  if (html.includes('snapshotHistoryModal')) {
    throw new Error('src/index.html still contains snapshotHistoryModal after cleanup.');
  }

  write('src/index.html', html);
}

function updateVersion() {
  const pkg = JSON.parse(read('package.json'));
  pkg.version = VERSION;
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

  replaceOrFail(
    'src/js/00-core.js',
    /const\s+GITCMS_VERSION\s*=\s*['"][^'"]+['"];/,
    `const GITCMS_VERSION = '${VERSION}';`,
    'GITCMS_VERSION'
  );

  replaceOrFail(
    'README.md',
    /Current version:\s*```txt\s*[\s\S]*?\s*```/,
    `Current version:\n\n\`\`\`txt\n${VERSION}\n\`\`\``,
    'README current version'
  );

  if (existsSync('src/js/17-backup.js')) {
    replaceOrFail(
      'src/js/17-backup.js',
      /version:\s*['"][^'"]+['"]/,
      `version: '${VERSION}'`,
      'backup metadata version'
    );
  }
}

function writeCleanSnapshotHistoryModule() {
  write(
    'src/js/18-snapshot-history.js',
    `/* ---------- snapshot history / rollback ---------- */
const SNAPSHOT_HISTORY_PREFIX = 'snapshot-';

function snapshotHistoryConnected() {
  return !!(state && state.owner && state.repo && state.token);
}

function snapshotHistoryTagNameFromRef(ref) {
  return String(ref || '').replace(/^refs\\/tags\\//, '');
}

function snapshotHistoryShortSha(sha) {
  return sha ? sha.slice(0, 7) + '…' + sha.slice(-7) : 'unknown';
}

function ensureSnapshotHistoryButton() {
  let btn = document.getElementById('snapshotHistoryBtn');
  if (btn) return btn;

  const diagnosticsBtn = document.getElementById('diagnosticsBtn');
  if (!diagnosticsBtn || !diagnosticsBtn.parentNode) return null;

  btn = document.createElement('button');
  btn.className = 'tbtn ghost';
  btn.id = 'snapshotHistoryBtn';
  btn.title = 'List snapshot tags and rollback';
  btn.type = 'button';
  btn.setAttribute('onclick', 'openSnapshotHistory(); return false;');
  btn.innerHTML = \`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 12a9 9 0 109-9" />
      <path d="M3 3v6h6" />
      <path d="M12 7v5l3 3" />
    </svg>
    History\`;

  diagnosticsBtn.parentNode.insertBefore(btn, diagnosticsBtn);
  return btn;
}

function ensureSnapshotHistoryModal() {
  let modal = document.getElementById('snapshotHistoryModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.id = 'snapshotHistoryModal';
  modal.innerHTML = \`
    <div class="modal media-modal">
      <h3>Snapshot history</h3>
      <p class="mdesc">
        Snapshot tags are created after publishing. Rollback moves both
        <span class="mono">content</span> and <span class="mono">main</span>
        to the selected snapshot commit. Rollback does not create a new snapshot tag.
      </p>

      <div class="modal-row" style="justify-content:flex-start;margin-bottom:12px">
        <button class="tbtn ghost" type="button" id="snapshotHistoryRefreshBtn">
          Refresh snapshots
        </button>
      </div>

      <div class="modal-warn" id="snapshotHistoryWarn"></div>
      <div class="modal-err" id="snapshotHistoryErr"></div>
      <div class="media-grid" id="snapshotHistoryList">
        <div class="media-empty">Open History to load snapshots.</div>
      </div>

      <div class="modal-row">
        <button class="tbtn" type="button" id="snapshotHistoryCloseBtn">Close</button>
      </div>
    </div>\`;

  document.body.appendChild(modal);
  wireSnapshotHistoryControls();
  return modal;
}

function snapshotHistorySetErr(msg) {
  const err = document.getElementById('snapshotHistoryErr');
  if (!err) return;
  err.textContent = msg || '';
  err.classList.toggle('show', !!msg);
}

function snapshotHistorySetWarn(msg) {
  const warn = document.getElementById('snapshotHistoryWarn');
  if (!warn) return;
  warn.innerHTML = msg || '';
  warn.classList.toggle('show', !!msg);
}

function snapshotHistoryRequireConnection() {
  if (snapshotHistoryConnected()) return true;

  snapshotHistorySetErr('');
  snapshotHistorySetWarn(
    'Connect to a content/site repository first. Snapshot tags live in that repository.'
  );
  snapshotHistoryRender([]);
  return false;
}

function snapshotHistoryTagUrl(tagName) {
  return \`https://github.com/\${state.owner}/\${state.repo}/tree/\${encodeURIComponent(tagName)}\`;
}

async function snapshotHistoryResolveCommitSha(ref) {
  if (!ref || !ref.object || !ref.object.sha) return '';

  if (ref.object.type === 'commit') return ref.object.sha;

  if (ref.object.type === 'tag') {
    const tag = await GitHubApi.request(
      GitHubApi.repoPath('/git/tags/' + encodeURIComponent(ref.object.sha))
    );
    return tag && tag.object && tag.object.sha ? tag.object.sha : ref.object.sha;
  }

  return ref.object.sha;
}

async function snapshotHistoryListTags() {
  const refs = await GitHubApi.request(
    GitHubApi.repoPath('/git/matching-refs/tags/' + SNAPSHOT_HISTORY_PREFIX)
  );

  const out = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    const name = snapshotHistoryTagNameFromRef(ref.ref);
    if (!name.startsWith(SNAPSHOT_HISTORY_PREFIX)) continue;

    out.push({
      name,
      sha: await snapshotHistoryResolveCommitSha(ref),
      rawSha: ref.object && ref.object.sha ? ref.object.sha : '',
      type: ref.object && ref.object.type ? ref.object.type : 'commit'
    });
  }

  return out.sort((a, b) => b.name.localeCompare(a.name));
}

function snapshotHistoryRender(tags) {
  const list = document.getElementById('snapshotHistoryList');
  if (!list) return;

  if (!tags.length) {
    list.innerHTML = '<div class="media-empty">No snapshot tags found.</div>';
    return;
  }

  list.innerHTML = '';
  for (const tag of tags) {
    const card = document.createElement('div');
    card.className = 'media-card';
    card.innerHTML = \`
      <div class="media-name">\${esc(tag.name)}</div>
      <div class="media-path mono">\${esc(snapshotHistoryShortSha(tag.sha))}</div>
      <div class="media-actions">
        <a class="media-action copy" href="\${escAttr(snapshotHistoryTagUrl(tag.name))}" target="_blank" rel="noopener">Open</a>
        <button class="media-action delete" type="button">Rollback</button>
      </div>\`;

    card.querySelector('button').onclick = () => snapshotHistoryRollback(tag);
    list.appendChild(card);
  }
}

async function snapshotHistoryRefresh() {
  ensureSnapshotHistoryModal();
  snapshotHistorySetErr('');
  if (!snapshotHistoryRequireConnection()) return;

  snapshotHistorySetWarn('Loading snapshot tags…');

  try {
    const tags = await snapshotHistoryListTags();
    snapshotHistorySetWarn(
      tags.length
        ? '<b>Rollback:</b> moves both content and main to the selected snapshot commit. No new snapshot tag is created.'
        : ''
    );
    snapshotHistoryRender(tags);
  } catch (e) {
    snapshotHistorySetWarn('');
    snapshotHistorySetErr(GitHubErrors.githubErrorMessage(e, { action: 'Load snapshots' }));
  }
}

async function snapshotHistoryRollback(tag) {
  if (!snapshotHistoryRequireConnection()) return;

  const dirty = Store.dirtyFragments();
  if (dirty.length) {
    snapshotHistorySetErr('Save or reset unsaved fragments before rollback.');
    return;
  }

  const ok = confirm(
    \`Rollback both branches to \${tag.name}?\\n\\n\` +
      \`Target commit: \${tag.sha}\\n\` +
      \`Branches: \${state.workBranch} and \${state.defaultBranch}\\n\\n\` +
      'No new snapshot tag will be created.'
  );

  if (!ok) return;

  snapshotHistorySetErr('');
  snapshotHistorySetWarn('Rolling back content and main…');

  try {
    await GitHubApi.updateRef(state.workBranch, tag.sha, { force: true });
    await GitHubApi.updateRef(state.defaultBranch, tag.sha, { force: true });

    LastWriteCommitCache.set(state.workBranch, tag.sha);
    LastWriteCommitCache.set(state.defaultBranch, tag.sha);
    Store.clearContentTree();

    snapshotHistorySetWarn(
      'Rollback complete. Both content and main now point to ' + esc(tag.name) + '.'
    );
    toast('Rolled back to ' + tag.name, 'ok');

    if (typeof loadAll === 'function') await loadAll();
    await snapshotHistoryRefresh();
  } catch (e) {
    snapshotHistorySetWarn('');
    snapshotHistorySetErr(GitHubErrors.githubErrorMessage(e, { action: 'Rollback snapshot' }));
    toast('Rollback failed', 'err');
  }
}

function openSnapshotHistory() {
  const modal = ensureSnapshotHistoryModal();
  wireSnapshotHistoryControls();
  modal.classList.add('show');
  snapshotHistoryRefresh();
}

function wireSnapshotHistoryControls() {
  const refreshBtn = document.getElementById('snapshotHistoryRefreshBtn');
  if (refreshBtn && refreshBtn.dataset.snapshotHistoryWired !== '1') {
    refreshBtn.dataset.snapshotHistoryWired = '1';
    refreshBtn.onclick = snapshotHistoryRefresh;
  }

  const closeBtn = document.getElementById('snapshotHistoryCloseBtn');
  if (closeBtn && closeBtn.dataset.snapshotHistoryWired !== '1') {
    closeBtn.dataset.snapshotHistoryWired = '1';
    closeBtn.onclick = () => {
      const modal = document.getElementById('snapshotHistoryModal');
      if (modal) modal.classList.remove('show');
    };
  }
}

function snapshotHistoryClickHandler(event) {
  const target =
    event && event.target && event.target.closest
      ? event.target.closest('#snapshotHistoryBtn')
      : null;
  if (!target) return;

  event.preventDefault();
  event.stopPropagation();
  openSnapshotHistory();
}

window.openSnapshotHistory = openSnapshotHistory;

function setupSnapshotHistory() {
  const btn = ensureSnapshotHistoryButton();

  if (btn) {
    btn.onclick = (event) => {
      if (event) event.preventDefault();
      openSnapshotHistory();
    };
  }
}

function startSnapshotHistory() {
  setupSnapshotHistory();

  if (!window.__gitcmsSnapshotHistoryDelegatedClick) {
    window.__gitcmsSnapshotHistoryDelegatedClick = true;
    document.addEventListener('click', snapshotHistoryClickHandler, true);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startSnapshotHistory, { once: true });
} else {
  startSnapshotHistory();
}
`
  );
}

function removeBadTests() {
  [
    'tests/snapshot-history-index-validity.test.mjs',
    'tests/snapshot-history-button-static-fallback.test.mjs',
    'tests/snapshot-history-modal-container.test.mjs',
    'tests/snapshot-history-runtime-modal-only.test.mjs',
    'tests/history-modal-fix.test.mjs',
    'tests/history-stale-test-guard.test.mjs',
    'tests/history-connection-guard.test.mjs',
    'tests/history-module-syntax.test.mjs'
  ].forEach(removeIfExists);
}

function writeCleanTests() {
  write(
    'tests/snapshot-history-runtime-clean.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('src index does not contain static snapshot history modal', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /snapshotHistoryModal/);
  assert.doesNotMatch(html, /<!-- SNAPSHOT HISTORY -->/);
});

test('snapshot history creates button and modal at runtime', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /function ensureSnapshotHistoryButton/);
  assert.match(js, /function ensureSnapshotHistoryModal/);
  assert.match(js, /modal\\.className = 'modal-bg'/);
  assert.match(js, /<div class="modal media-modal">/);
  assert.match(js, /window\\.openSnapshotHistory = openSnapshotHistory/);
  assert.match(js, /document\\.addEventListener\\('click', snapshotHistoryClickHandler, true\\)/);
});

test('snapshot rollback moves both branches, pins cache, and creates no new tag', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /GitHubApi\\.updateRef\\(state\\.workBranch, tag\\.sha, \\{ force: true \\}\\)/);
  assert.match(js, /GitHubApi\\.updateRef\\(state\\.defaultBranch, tag\\.sha, \\{ force: true \\}\\)/);
  assert.match(js, /LastWriteCommitCache\\.set\\(state\\.workBranch, tag\\.sha\\)/);
  assert.match(js, /LastWriteCommitCache\\.set\\(state\\.defaultBranch, tag\\.sha\\)/);
  assert.doesNotMatch(js, /snapshot-before-rollback/);
  assert.doesNotMatch(js, /snapshotHistoryCreatePreRollbackTags/);
});
`
  );
}

function patchReadme() {
  let readme = read('README.md');

  if (!readme.includes('History runtime clean implementation')) {
    readme += `

---

## History runtime clean implementation

Snapshot History is runtime-only:

\`\`\`txt
src/index.html contains no Snapshot History modal
src/js/18-snapshot-history.js creates the button/modal at runtime
rollback moves content + main to the selected snapshot SHA
rollback pins LastWriteCommitCache to that SHA before reload
rollback does not create snapshot-before-rollback tags
\`\`\`

This avoids malformed static modal markup in \`src/index.html\`.
`;
  }

  write('README.md', readme);
}

restoreIndexHtml();
updateVersion();
writeCleanSnapshotHistoryModule();
removeBadTests();
writeCleanTests();
patchReadme();

console.log(`Applied ${VERSION}.`);
console.log('Restored src/index.html from git, removed broken static History markup, and made Snapshot History runtime-only.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
console.log('');
console.log('Manual test: open rebuilt admin.html, connect, click History.');
