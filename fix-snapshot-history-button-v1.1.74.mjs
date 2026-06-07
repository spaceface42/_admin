#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.74-history-button-binding-fix';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
}

function replaceOrFail(path, pattern, replacement, label) {
  const before = read(path);
  const after = before.replace(pattern, replacement);
  if (after === before) throw new Error(`Could not update ${label} in ${path}`);
  write(path, after);
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

function patchSnapshotHistoryModule() {
  const path = 'src/js/18-snapshot-history.js';
  if (!existsSync(path)) {
    throw new Error('src/js/18-snapshot-history.js not found. Apply v1.1.73 first.');
  }

  const source = read(path);

  const replacement = `/* ---------- snapshot history / rollback ---------- */
const SNAPSHOT_HISTORY_PREFIX = 'snapshot-';
const SNAPSHOT_ROLLBACK_PREFIX = 'snapshot-before-rollback-';

function snapshotHistoryConnected() {
  return !!(state && state.owner && state.repo && state.token);
}

function snapshotHistoryTagNameFromRef(ref) {
  return String(ref || '').replace(/^refs\\/tags\\//, '');
}

function snapshotHistoryPad(n) {
  return String(n).padStart(2, '0');
}

function snapshotHistoryTimestamp(date = new Date()) {
  return (
    date.getFullYear() +
    '-' +
    snapshotHistoryPad(date.getMonth() + 1) +
    '-' +
    snapshotHistoryPad(date.getDate()) +
    '-' +
    snapshotHistoryPad(date.getHours()) +
    snapshotHistoryPad(date.getMinutes()) +
    snapshotHistoryPad(date.getSeconds())
  );
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
  modal.className = 'modal';
  modal.id = 'snapshotHistoryModal';
  modal.innerHTML = \`
    <div class="modal-card wide">
      <h3>Snapshot history</h3>
      <p class="mdesc">
        Snapshot tags are created after publishing. Rollback moves both
        <span class="mono">content</span> and <span class="mono">main</span>
        to the selected snapshot commit.
      </p>

      <div class="modal-actions" style="justify-content:flex-start;gap:8px;flex-wrap:wrap">
        <button class="tbtn ghost" type="button" id="snapshotHistoryRefreshBtn">
          Refresh snapshots
        </button>
      </div>

      <div class="media-warn" id="snapshotHistoryWarn"></div>
      <div class="media-err" id="snapshotHistoryErr"></div>
      <div class="media-grid" id="snapshotHistoryList">
        <div class="media-empty">Open History to load snapshots.</div>
      </div>

      <div class="modal-actions">
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

async function snapshotHistoryCreateTag(prefix, sha) {
  if (!sha) throw new Error('Cannot create snapshot tag without a commit SHA.');

  let lastError = null;
  for (let i = 0; i < 5; i++) {
    const base = prefix + snapshotHistoryTimestamp();
    const tagName = i === 0 ? base : base + '-' + (i + 1);

    try {
      await GitHubApi.request(GitHubApi.repoPath('/git/refs'), {
        method: 'POST',
        body: {
          ref: 'refs/tags/' + tagName,
          sha
        }
      });
      return tagName;
    } catch (e) {
      lastError = e;
      if (e.status !== 422) throw e;
      await sleep(1000);
    }
  }

  throw lastError || new Error('Could not create rollback safety tag.');
}

async function snapshotHistoryBranchRefs() {
  const [contentRef, mainRef] = await Promise.all([
    GitHubApi.getRef(state.workBranch),
    GitHubApi.getRef(state.defaultBranch)
  ]);

  return {
    contentSha: contentRef && contentRef.object ? contentRef.object.sha : '',
    mainSha: mainRef && mainRef.object ? mainRef.object.sha : ''
  };
}

async function snapshotHistoryCreatePreRollbackTags() {
  const refs = await snapshotHistoryBranchRefs();
  const created = [];

  if (refs.mainSha) {
    created.push(await snapshotHistoryCreateTag(SNAPSHOT_ROLLBACK_PREFIX + 'main-', refs.mainSha));
  }

  if (refs.contentSha && refs.contentSha !== refs.mainSha) {
    created.push(
      await snapshotHistoryCreateTag(SNAPSHOT_ROLLBACK_PREFIX + 'content-', refs.contentSha)
    );
  }

  return created;
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
        ? '<b>Rollback safety:</b> rollback creates a pre-rollback safety tag before moving branches.'
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
      'A pre-rollback safety tag will be created first.'
  );

  if (!ok) return;

  snapshotHistorySetErr('');
  snapshotHistorySetWarn('Creating pre-rollback safety tag…');

  try {
    const safety = await snapshotHistoryCreatePreRollbackTags();

    snapshotHistorySetWarn('Rolling back content and main…');
    await GitHubApi.updateRef(state.workBranch, tag.sha, { force: true });
    await GitHubApi.updateRef(state.defaultBranch, tag.sha, { force: true });

    LastWriteCommitCache.clear(state.workBranch);
    LastWriteCommitCache.clear(state.defaultBranch);
    Store.clearContentTree();

    snapshotHistorySetWarn(
      \`Rollback complete.\${safety.length ? ' Safety tag: ' + safety.map(esc).join(', ') : ''}\`
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
    closeBtn.onclick = () => document.getElementById('snapshotHistoryModal').classList.remove('show');
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

function setupSnapshotHistory() {
  const btn = ensureSnapshotHistoryButton();
  ensureSnapshotHistoryModal();

  if (btn) {
    btn.onclick = (event) => {
      if (event) event.preventDefault();
      openSnapshotHistory();
    };
  }

  wireSnapshotHistoryControls();
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
`;

  if (!source.includes('snapshotHistoryListTags')) {
    throw new Error('Current snapshot history module does not look like expected v1.1.73 module.');
  }

  write(path, replacement);
}

function patchTests() {
  write(
    'tests/snapshot-history-binding.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snapshot history has robust button and delegated click binding', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /function ensureSnapshotHistoryButton/);
  assert.match(js, /function ensureSnapshotHistoryModal/);
  assert.match(js, /function snapshotHistoryClickHandler/);
  assert.match(js, /document\\.addEventListener\\('click', snapshotHistoryClickHandler, true\\)/);
  assert.match(js, /DOMContentLoaded/);
  assert.match(js, /openSnapshotHistory\\(\\)/);
});

test('snapshot history modal can be runtime-created', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /document\\.createElement\\('div'\\)/);
  assert.match(js, /modal\\.id = 'snapshotHistoryModal'/);
  assert.match(js, /id="snapshotHistoryRefreshBtn"/);
  assert.match(js, /id="snapshotHistoryList"/);
});
`
  );
}

updateVersion();
patchSnapshotHistoryModule();
patchTests();

console.log(`Applied ${VERSION}.`);
console.log('History button now has direct binding, delegated capture binding, DOM-ready startup, and runtime modal creation.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
console.log('');
console.log('Manual test: open rebuilt admin.html, connect to _blackhole, click History.');
