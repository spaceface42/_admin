import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snapshot history numbers snapshots oldest to newest', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /function snapshotHistoryNumberTags\(tags\)/);
  assert.match(
    js,
    /sortedOldestFirst = \[\.\.\.tags\]\.sort\(\(a, b\) => a\.name\.localeCompare\(b\.name\)\)/
  );
  assert.match(js, /byName\.set\(tag\.name, index \+ 1\)/);
  assert.match(js, /const snapshotNumberByName = snapshotHistoryNumberTags\(tags\)/);
  assert.match(js, /snapshotNumberByName\.get\(tag\.name\)/);
});

test('snapshot history cards render a visual number beside the date', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /snapshot-history-number/);
  assert.match(js, /snapshot-history-head/);
  assert.match(js, /snapshotHistoryDisplayDate\(tag\.name\)/);
});

test('README documents snapshot numbering', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Snapshot numbering/);
  assert.match(readme, /oldest snapshot = 1/);
  assert.match(readme, /newest snapshot = total snapshot count/);
});
