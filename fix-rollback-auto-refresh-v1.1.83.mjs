#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.83-rollback-auto-refresh';

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

function patchSnapshotHistory() {
  const path = 'src/js/18-snapshot-history.js';
  if (!existsSync(path)) throw new Error('src/js/18-snapshot-history.js not found');

  let js = read(path);

  if (!js.includes('async function snapshotHistoryRefreshEditorAfterRollback')) {
    js = js.replace(
      /async function snapshotHistoryRollback\(tag\) \{/,
      `async function snapshotHistoryRefreshEditorAfterRollback(tag) {
  LastWriteCommitCache.set(state.workBranch, tag.sha);
  LastWriteCommitCache.set(state.defaultBranch, tag.sha);
  Store.clearContentTree();

  if (typeof loadAll === 'function') await loadAll();

  // GitHub ref reads can lag briefly after force-updating both branches.
  // A delayed second reload mirrors the manual Refresh button behavior and
  // makes the editor settle on the rollback commit without user action.
  await sleep(1400);

  LastWriteCommitCache.set(state.workBranch, tag.sha);
  LastWriteCommitCache.set(state.defaultBranch, tag.sha);
  Store.clearContentTree();

  if (typeof loadAll === 'function') await loadAll();
}

async function snapshotHistoryRollback(tag) {`
    );
  }

  const oldBlock = `    LastWriteCommitCache.set(state.workBranch, tag.sha);
    LastWriteCommitCache.set(state.defaultBranch, tag.sha);
    Store.clearContentTree();

    snapshotHistorySetWarn(
      'Rollback complete. Both content and main now point to ' + esc(tag.name) + '.'
    );
    toast('Rolled back to ' + tag.name, 'ok');

    if (typeof loadAll === 'function') await loadAll();
    await snapshotHistoryRefresh();`;

  const newBlock = `    snapshotHistorySetWarn(
      'Rollback complete. Refreshing editor from rollback commit…'
    );
    toast('Rolled back to ' + tag.name, 'ok');

    await snapshotHistoryRefreshEditorAfterRollback(tag);

    snapshotHistorySetWarn(
      'Rollback complete. Both content and main now point to ' + esc(tag.name) + '.'
    );
    await snapshotHistoryRefresh();`;

  if (js.includes(oldBlock)) {
    js = js.replace(oldBlock, newBlock);
  } else if (!js.includes('await snapshotHistoryRefreshEditorAfterRollback(tag);')) {
    throw new Error('Could not find rollback reload block to replace.');
  }

  write(path, js);
}

function patchReadme() {
  let readme = read('README.md');

  if (!readme.includes('Rollback automatic editor refresh')) {
    readme += `

---

## Rollback automatic editor refresh

After moving both branches to the selected snapshot SHA, Snapshot History automatically
reloads the editor twice:

\`\`\`txt
1. immediate reload pinned to selected snapshot SHA
2. delayed reload after GitHub branch refs have settled
\`\`\`

This mirrors clicking the normal Refresh button manually after rollback, so the editor
shows the rolled-back content without extra user action.
`;
  }

  write('README.md', readme);
}

function writeTests() {
  write(
    'tests/snapshot-rollback-auto-refresh.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rollback performs automatic delayed editor refresh after moving branches', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /async function snapshotHistoryRefreshEditorAfterRollback\\(tag\\)/);
  assert.match(js, /await sleep\\(1400\\)/);
  assert.match(js, /await snapshotHistoryRefreshEditorAfterRollback\\(tag\\)/);
  assert.match(js, /Rollback complete\\. Refreshing editor from rollback commit/);
});

test('rollback auto refresh pins both branches before each reload', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');
  const helperStart = js.indexOf('async function snapshotHistoryRefreshEditorAfterRollback');
  const helperEnd = js.indexOf('async function snapshotHistoryRollback', helperStart);

  assert.notEqual(helperStart, -1);
  assert.notEqual(helperEnd, -1);

  const helper = js.slice(helperStart, helperEnd);
  const workPins = helper.match(/LastWriteCommitCache\\.set\\(state\\.workBranch, tag\\.sha\\)/g) || [];
  const mainPins = helper.match(/LastWriteCommitCache\\.set\\(state\\.defaultBranch, tag\\.sha\\)/g) || [];
  const clears = helper.match(/Store\\.clearContentTree\\(\\)/g) || [];
  const loads = helper.match(/loadAll\\(\\)/g) || [];

  assert.equal(workPins.length, 2);
  assert.equal(mainPins.length, 2);
  assert.equal(clears.length, 2);
  assert.ok(loads.length >= 2);
});

test('README documents rollback automatic editor refresh', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Rollback automatic editor refresh/);
  assert.match(readme, /delayed reload/);
});
`
  );
}

updateVersion();
patchSnapshotHistory();
patchReadme();
writeTests();

console.log(`Applied ${VERSION}.`);
console.log('Rollback now automatically refreshes the editor twice: immediate + delayed.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
console.log('');
console.log('Manual test: rollback, wait about 2 seconds, confirm editor shows rolled-back content without pressing Refresh.');
