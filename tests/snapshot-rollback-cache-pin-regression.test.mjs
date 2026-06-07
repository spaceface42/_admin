import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rollback cache pin fix is reflected in snapshot history tests', () => {
  const historyTest = readFileSync(
    new URL('../tests/snapshot-history-rollback.test.mjs', import.meta.url),
    'utf8'
  );

  assert.match(historyTest, /LastWriteCommitCache\\.set\\\(state\\.workBranch, tag\\.sha\\\)/);
  assert.match(historyTest, /LastWriteCommitCache\\.set\\\(state\\.defaultBranch, tag\\.sha\\\)/);
  assert.doesNotMatch(historyTest, /LastWriteCommitCache\\.clear\\\(state\\.workBranch\\\)/);
  assert.doesNotMatch(historyTest, /LastWriteCommitCache\\.clear\\\(state\\.defaultBranch\\\)/);
});
