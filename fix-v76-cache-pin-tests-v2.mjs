#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
}

const historyTestPath = 'tests/snapshot-history-rollback.test.mjs';
if (!existsSync(historyTestPath)) {
  throw new Error(`${historyTestPath} not found`);
}

let historyTest = read(historyTestPath);

// Add the missing defaultBranch cache-pin assertion in the existing history test.
if (
  historyTest.includes('LastWriteCommitCache\\.set\\(state\\.workBranch, tag\\.sha\\)') &&
  !historyTest.includes('LastWriteCommitCache\\.set\\(state\\.defaultBranch, tag\\.sha\\)')
) {
  historyTest = historyTest.replace(
    /assert\.match\(js,\s*\/LastWriteCommitCache\\\.set\\\(state\\\.workBranch, tag\\\.sha\\\)\/\);\s*/,
    `assert.match(js, /LastWriteCommitCache\\.set\\(state\\.workBranch, tag\\.sha\\)/);\n  assert.match(js, /LastWriteCommitCache\\.set\\(state\\.defaultBranch, tag\\.sha\\)/);\n  `
  );
}

write(historyTestPath, historyTest);

// Replace the bad self-referential regression test.
// It should validate runtime source, not validate the text of another test file.
write(
  'tests/snapshot-rollback-cache-pin-regression.test.mjs',
  `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rollback pins both branch caches to selected snapshot SHA', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /LastWriteCommitCache\\.set\\(state\\.workBranch, tag\\.sha\\)/);
  assert.match(js, /LastWriteCommitCache\\.set\\(state\\.defaultBranch, tag\\.sha\\)/);
  assert.doesNotMatch(js, /LastWriteCommitCache\\.clear\\(state\\.workBranch\\)/);
  assert.doesNotMatch(js, /LastWriteCommitCache\\.clear\\(state\\.defaultBranch\\)/);
});
`
);

console.log('Fixed v1.1.76 stale cache-pin tests.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
