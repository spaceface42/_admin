#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
}

const testPath = 'tests/snapshot-history-rollback.test.mjs';

if (!existsSync(testPath)) {
  throw new Error(`${testPath} not found`);
}

let test = read(testPath);

// v1.1.76 changed rollback behavior:
// old: clear LastWriteCommitCache after rollback
// new: pin LastWriteCommitCache to the selected snapshot SHA before reload
test = test.replace(
  /assert\.match\(js,\s*\/LastWriteCommitCache\\\.clear\\\(state\\\.workBranch\\\)\/\);\s*/g,
  `assert.match(js, /LastWriteCommitCache\\.set\\(state\\.workBranch, tag\\.sha\\)/);\n  `
);

test = test.replace(
  /assert\.match\(js,\s*\/LastWriteCommitCache\\\.clear\\\(state\\\.defaultBranch\\\)\/\);\s*/g,
  `assert.match(js, /LastWriteCommitCache\\.set\\(state\\.defaultBranch, tag\\.sha\\)/);\n  `
);

test = test.replace(
  /snapshot rollback moves both content and main to selected snapshot/g,
  'snapshot rollback moves both branches and pins cache to selected snapshot'
);

write(testPath, test);

const guardPath = 'tests/snapshot-rollback-cache-pin-regression.test.mjs';
write(
  guardPath,
  `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rollback cache pin fix is reflected in snapshot history tests', () => {
  const historyTest = readFileSync(
    new URL('../tests/snapshot-history-rollback.test.mjs', import.meta.url),
    'utf8'
  );

  assert.match(historyTest, /LastWriteCommitCache\\\\.set\\\\\\(state\\\\.workBranch, tag\\\\.sha\\\\\\)/);
  assert.match(historyTest, /LastWriteCommitCache\\\\.set\\\\\\(state\\\\.defaultBranch, tag\\\\.sha\\\\\\)/);
  assert.doesNotMatch(historyTest, /LastWriteCommitCache\\\\.clear\\\\\\(state\\\\.workBranch\\\\\\)/);
  assert.doesNotMatch(historyTest, /LastWriteCommitCache\\\\.clear\\\\\\(state\\\\.defaultBranch\\\\\\)/);
});
`
);

console.log('Fixed stale v1.1.76 test expectations.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
