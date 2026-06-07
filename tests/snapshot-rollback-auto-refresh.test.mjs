import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rollback performs automatic delayed editor refresh after moving branches', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /async function snapshotHistoryRefreshEditorAfterRollback\(tag\)/);
  assert.match(js, /await sleep\(1400\)/);
  assert.match(js, /await snapshotHistoryRefreshEditorAfterRollback\(tag\)/);
  assert.match(js, /Rollback complete\. Refreshing editor from rollback commit/);
});

test('rollback auto refresh pins both branches before each reload', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');
  const helperStart = js.indexOf('async function snapshotHistoryRefreshEditorAfterRollback');
  const helperEnd = js.indexOf('async function snapshotHistoryRollback', helperStart);

  assert.notEqual(helperStart, -1);
  assert.notEqual(helperEnd, -1);

  const helper = js.slice(helperStart, helperEnd);
  const workPins = helper.match(/LastWriteCommitCache\.set\(state\.workBranch, tag\.sha\)/g) || [];
  const mainPins =
    helper.match(/LastWriteCommitCache\.set\(state\.defaultBranch, tag\.sha\)/g) || [];
  const clears = helper.match(/Store\.clearContentTree\(\)/g) || [];
  const loads = helper.match(/loadAll\(\)/g) || [];

  assert.equal(workPins.length, 2);
  assert.equal(mainPins.length, 2);
  assert.equal(clears.length, 2);
  assert.ok(loads.length >= 2);
});

test('README documents rollback automatic editor refresh', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Rollback automatic editor refresh/);
  assert.match(readme, /delayed reload/);
});
