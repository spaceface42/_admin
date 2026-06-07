import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('src index does not contain static snapshot history modal', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /snapshotHistoryModal/);
  assert.doesNotMatch(html, /<!-- SNAPSHOT HISTORY -->/);
});

test('snapshot history creates button and modal at runtime', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /function ensureSnapshotHistoryButton/);
  assert.match(js, /function ensureSnapshotHistoryModal/);
  assert.match(js, /modal\.className = 'modal-bg'/);
  assert.match(js, /<div class="modal media-modal">/);
  assert.match(js, /window\.openSnapshotHistory = openSnapshotHistory/);
  assert.match(js, /document\.addEventListener\('click', snapshotHistoryClickHandler, true\)/);
});

test('snapshot rollback moves both branches, pins cache, and creates no new tag', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /GitHubApi\.updateRef\(state\.workBranch, tag\.sha, \{ force: true \}\)/);
  assert.match(js, /GitHubApi\.updateRef\(state\.defaultBranch, tag\.sha, \{ force: true \}\)/);
  assert.match(js, /LastWriteCommitCache\.set\(state\.workBranch, tag\.sha\)/);
  assert.match(js, /LastWriteCommitCache\.set\(state\.defaultBranch, tag\.sha\)/);
  assert.doesNotMatch(js, /snapshot-before-rollback/);
  assert.doesNotMatch(js, /snapshotHistoryCreatePreRollbackTags/);
});
