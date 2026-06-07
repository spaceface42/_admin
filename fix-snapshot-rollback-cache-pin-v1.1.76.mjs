#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.76-rollback-cache-pin-fix';

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

function patchSnapshotRollbackCachePin() {
  const path = 'src/js/18-snapshot-history.js';
  if (!existsSync(path)) {
    throw new Error('src/js/18-snapshot-history.js not found. Apply snapshot history first.');
  }

  let js = read(path);

  const oldBlock = `    await GitHubApi.updateRef(state.workBranch, tag.sha, { force: true });
    await GitHubApi.updateRef(state.defaultBranch, tag.sha, { force: true });

    LastWriteCommitCache.clear(state.workBranch);
    LastWriteCommitCache.clear(state.defaultBranch);
    Store.clearContentTree();`;

  const newBlock = `    await GitHubApi.updateRef(state.workBranch, tag.sha, { force: true });
    await GitHubApi.updateRef(state.defaultBranch, tag.sha, { force: true });

    // GitHub branch-ref reads can lag immediately after a force update.
    // Pin both branches to the rollback SHA so the editor reloads the selected
    // snapshot commit immediately instead of briefly re-reading the pre-rollback head.
    LastWriteCommitCache.set(state.workBranch, tag.sha);
    LastWriteCommitCache.set(state.defaultBranch, tag.sha);
    Store.clearContentTree();`;

  if (js.includes(oldBlock)) {
    js = js.replace(oldBlock, newBlock);
  } else if (!js.includes('LastWriteCommitCache.set(state.workBranch, tag.sha)')) {
    throw new Error('Could not find rollback cache clear block to replace.');
  }

  write(path, js);
}

function patchReadme() {
  let readme = read('README.md');

  if (!readme.includes('Rollback cache pinning')) {
    readme += `

---

## Rollback cache pinning

After rollback, GitHub branch-ref reads can lag briefly even when the ref update
request has already succeeded. The rollback flow therefore pins both branches in
\`LastWriteCommitCache\` to the selected snapshot SHA before calling \`loadAll()\`.

Do this:

\`\`\`txt
update content ref
update main ref
pin content + main to rollback SHA
clear content tree
reload
\`\`\`

Do not clear the write cache immediately after rollback, because that can make the
editor reload a stale branch ref.
`;
  }

  write('README.md', readme);
}

function writeTests() {
  write(
    'tests/snapshot-rollback-cache-pin.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snapshot rollback pins cache to rollback SHA before reload', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /GitHubApi\\.updateRef\\(state\\.workBranch, tag\\.sha, \\{ force: true \\}\\)/);
  assert.match(js, /GitHubApi\\.updateRef\\(state\\.defaultBranch, tag\\.sha, \\{ force: true \\}\\)/);
  assert.match(js, /LastWriteCommitCache\\.set\\(state\\.workBranch, tag\\.sha\\)/);
  assert.match(js, /LastWriteCommitCache\\.set\\(state\\.defaultBranch, tag\\.sha\\)/);
  assert.match(js, /if \\(typeof loadAll === 'function'\\) await loadAll\\(\\)/);
});

test('snapshot rollback does not clear branch write cache immediately after updating refs', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');
  const rollbackStart = js.indexOf('async function snapshotHistoryRollback');
  const rollbackEnd = js.indexOf('function openSnapshotHistory', rollbackStart);

  assert.notEqual(rollbackStart, -1);
  assert.notEqual(rollbackEnd, -1);

  const body = js.slice(rollbackStart, rollbackEnd);
  assert.doesNotMatch(body, /LastWriteCommitCache\\.clear\\(state\\.workBranch\\)/);
  assert.doesNotMatch(body, /LastWriteCommitCache\\.clear\\(state\\.defaultBranch\\)/);
});

test('README documents rollback cache pinning', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /Rollback cache pinning/);
  assert.match(readme, /pin content \\+ main to rollback SHA/);
});
`
  );
}

updateVersion();
patchSnapshotRollbackCachePin();
patchReadme();
writeTests();

console.log(`Applied ${VERSION}.`);
console.log('Rollback now pins LastWriteCommitCache to the selected snapshot SHA before reload.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
console.log('');
console.log('Manual test: rollback to an older snapshot, wait for reload, confirm editor content matches that snapshot.');
