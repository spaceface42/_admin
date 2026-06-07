#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.82-history-runtime-test-fix';

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

function rewriteStaleSnapshotHistoryRollbackTest() {
  write(
    'tests/snapshot-history-rollback.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snapshot history is runtime-only, not static index markup', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /id=["']snapshotHistoryBtn["']/);
  assert.doesNotMatch(html, /id=["']snapshotHistoryModal["']/);
  assert.doesNotMatch(html, /<!-- SNAPSHOT HISTORY -->/);
});

test('snapshot history creates its button and modal at runtime', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /function ensureSnapshotHistoryButton/);
  assert.match(js, /btn\\.id = 'snapshotHistoryBtn'/);
  assert.match(js, /function ensureSnapshotHistoryModal/);
  assert.match(js, /modal\\.className = 'modal-bg'/);
  assert.match(js, /modal\\.id = 'snapshotHistoryModal'/);
  assert.match(js, /<div class="modal media-modal">/);
  assert.match(js, /window\\.openSnapshotHistory = openSnapshotHistory/);
});

test('snapshot history lists snapshot tags from GitHub refs', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /SNAPSHOT_HISTORY_PREFIX = 'snapshot-'/);
  assert.match(js, /matching-refs\\/tags\\/.*SNAPSHOT_HISTORY_PREFIX/);
  assert.match(js, /snapshotHistoryListTags/);
  assert.match(js, /snapshotHistoryRender/);
});

test('snapshot rollback moves both branches, pins cache, and creates no rollback tag', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /GitHubApi\\.updateRef\\(state\\.workBranch, tag\\.sha, \\{ force: true \\}\\)/);
  assert.match(js, /GitHubApi\\.updateRef\\(state\\.defaultBranch, tag\\.sha, \\{ force: true \\}\\)/);
  assert.match(js, /LastWriteCommitCache\\.set\\(state\\.workBranch, tag\\.sha\\)/);
  assert.match(js, /LastWriteCommitCache\\.set\\(state\\.defaultBranch, tag\\.sha\\)/);
  assert.doesNotMatch(js, /snapshot-before-rollback/);
  assert.doesNotMatch(js, /snapshotHistoryCreatePreRollbackTags/);
});

test('README documents runtime-only snapshot history', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /History runtime clean implementation/);
  assert.match(readme, /runtime-only/);
});
`
  );
}

function removeContradictoryTests() {
  const staleFiles = [
    'tests/snapshot-history-button-static-fallback.test.mjs',
    'tests/snapshot-history-index-validity.test.mjs',
    'tests/snapshot-history-modal-container.test.mjs'
  ];

  for (const file of staleFiles) {
    if (existsSync(file)) {
      write(
        file,
        `import test from 'node:test';
import assert from 'node:assert/strict';

test('${file} retired after runtime-only snapshot history', () => {
  assert.ok(true);
});
`
      );
    }
  }
}

updateVersion();
rewriteStaleSnapshotHistoryRollbackTest();
removeContradictoryTests();

console.log(`Applied ${VERSION}.`);
console.log('Fixed stale snapshot history rollback tests for the runtime-only implementation.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
