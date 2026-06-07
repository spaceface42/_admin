import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snapshot history cards show larger date and deterministic color', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /function snapshotHistoryParseDate/);
  assert.match(js, /function snapshotHistoryDisplayDate/);
  assert.match(js, /function snapshotHistoryAccentHue/);
  assert.match(js, /function snapshotHistoryApplyColor/);
  assert.match(js, /snapshotHistoryApplyColor\(card, tag\)/);
  assert.match(js, /snapshotHistoryDisplayDate\(tag\.name\)/);
});

test('snapshot history can delete snapshot tags without changing branches', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /async function snapshotHistoryDelete\(tag\)/);
  assert.match(js, /Only snapshot-\* tags can be deleted here/);
  assert.match(
    js,
    /GitHubApi\.repoPath\('\/git\/refs\/tags\/' \+ encodeURIComponent\(tag\.name\)\)/
  );
  assert.match(js, /method: 'DELETE'/);
  assert.match(js, /data-action="delete"/);

  const deleteStart = js.indexOf('async function snapshotHistoryDelete');
  const deleteEnd = js.indexOf('function snapshotHistoryRender', deleteStart);
  const deleteBody = js.slice(deleteStart, deleteEnd);

  assert.doesNotMatch(deleteBody, /updateRef/);
  assert.doesNotMatch(deleteBody, /state\.workBranch/);
  assert.doesNotMatch(deleteBody, /state\.defaultBranch/);
});

test('README documents snapshot cards and deletion', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Snapshot cards and deletion/);
  assert.match(readme, /Delete removes only the selected/);
});
