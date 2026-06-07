import test from 'node:test';
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
  assert.match(js, /btn\.id = 'snapshotHistoryBtn'/);
  assert.match(js, /function ensureSnapshotHistoryModal/);
  assert.match(js, /modal\.className = 'modal-bg'/);
  assert.match(js, /modal\.id = 'snapshotHistoryModal'/);
  assert.match(js, /<div class="modal media-modal">/);
  assert.match(js, /window\.openSnapshotHistory = openSnapshotHistory/);
});

test('snapshot history lists snapshot tags from GitHub refs', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /SNAPSHOT_HISTORY_PREFIX = 'snapshot-'/);
  assert.match(js, /matching-refs\/tags\/.*SNAPSHOT_HISTORY_PREFIX/);
  assert.match(js, /snapshotHistoryListTags/);
  assert.match(js, /snapshotHistoryRender/);
});

test('snapshot rollback moves both branches, pins cache, and creates no rollback tag', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /GitHubApi\.updateRef\(state\.workBranch, tag\.sha, \{ force: true \}\)/);
  assert.match(js, /GitHubApi\.updateRef\(state\.defaultBranch, tag\.sha, \{ force: true \}\)/);
  assert.match(js, /LastWriteCommitCache\.set\(state\.workBranch, tag\.sha\)/);
  assert.match(js, /LastWriteCommitCache\.set\(state\.defaultBranch, tag\.sha\)/);
  assert.doesNotMatch(js, /snapshot-before-rollback/);
  assert.doesNotMatch(js, /snapshotHistoryCreatePreRollbackTags/);
});

test('README documents runtime-only snapshot history', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /History runtime clean implementation/);
  assert.match(readme, /runtime-only/);
});
