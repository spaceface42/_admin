import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snapshot history has robust button and delegated click binding', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /function ensureSnapshotHistoryButton/);
  assert.match(js, /function ensureSnapshotHistoryModal/);
  assert.match(js, /function snapshotHistoryClickHandler/);
  assert.match(js, /document\.addEventListener\('click', snapshotHistoryClickHandler, true\)/);
  assert.match(js, /DOMContentLoaded/);
  assert.match(js, /openSnapshotHistory\(\)/);
});

test('snapshot history modal can be runtime-created', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /document\.createElement\('div'\)/);
  assert.match(js, /modal\.id = 'snapshotHistoryModal'/);
  assert.match(js, /id="snapshotHistoryRefreshBtn"/);
  assert.match(js, /id="snapshotHistoryList"/);
});
