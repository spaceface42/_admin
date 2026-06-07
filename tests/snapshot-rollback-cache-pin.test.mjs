import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snapshot rollback pins cache to rollback SHA before reload', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /GitHubApi\.updateRef\(state\.workBranch, tag\.sha, \{ force: true \}\)/);
  assert.match(js, /GitHubApi\.updateRef\(state\.defaultBranch, tag\.sha, \{ force: true \}\)/);
  assert.match(js, /LastWriteCommitCache\.set\(state\.workBranch, tag\.sha\)/);
  assert.match(js, /LastWriteCommitCache\.set\(state\.defaultBranch, tag\.sha\)/);
  assert.match(js, /if \(typeof loadAll === 'function'\) await loadAll\(\)/);
});

test('snapshot rollback does not clear branch write cache immediately after updating refs', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');
  const rollbackStart = js.indexOf('async function snapshotHistoryRollback');
  const rollbackEnd = js.indexOf('function openSnapshotHistory', rollbackStart);

  assert.notEqual(rollbackStart, -1);
  assert.notEqual(rollbackEnd, -1);

  const body = js.slice(rollbackStart, rollbackEnd);
  assert.doesNotMatch(body, /LastWriteCommitCache\.clear\(state\.workBranch\)/);
  assert.doesNotMatch(body, /LastWriteCommitCache\.clear\(state\.defaultBranch\)/);
});

test('README documents rollback cache pinning', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /Rollback cache pinning/);
  assert.match(readme, /pin content \+ main to rollback SHA/);
});
