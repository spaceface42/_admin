import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rollback does not create pre-rollback snapshot tags', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.doesNotMatch(js, /snapshot-before-rollback/);
  assert.doesNotMatch(js, /SNAPSHOT_ROLLBACK_PREFIX/);
  assert.doesNotMatch(js, /snapshotHistoryCreatePreRollbackTags/);
  assert.doesNotMatch(js, /Creating pre-rollback safety tag/);
});

test('rollback still moves both branches and pins cache to selected snapshot', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /GitHubApi\.updateRef\(state\.workBranch, tag\.sha, \{ force: true \}\)/);
  assert.match(js, /GitHubApi\.updateRef\(state\.defaultBranch, tag\.sha, \{ force: true \}\)/);
  assert.match(js, /LastWriteCommitCache\.set\(state\.workBranch, tag\.sha\)/);
  assert.match(js, /LastWriteCommitCache\.set\(state\.defaultBranch, tag\.sha\)/);
  assert.match(js, /Rollback complete\. Both content and main now point to/);
});

test('README documents that rollback does not create snapshots', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Rollback does not create snapshots/);
  assert.match(readme, /snapshots represent published states only/);
});
