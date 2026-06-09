import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('publish creates immutable snapshot title slugs inside tag names', () => {
  const js = readFileSync(new URL('../src/js/12-publish.js', import.meta.url), 'utf8');

  assert.match(js, /function snapshotPublishTitleSlug\(input\)/);
  assert.match(js, /function snapshotPublishPromptTitle\(\)/);
  assert.match(js, /function snapshotPublishTagName\(title = ''\)/);
  assert.match(js, /window\.prompt/);
  assert.match(js, /'snapshot-' \+ timestamp \+ \(slug \? '--' \+ slug : ''\)/);
  assert.match(js, /async function createSnapshotTagForPublish\(sha\)/);
  assert.match(js, /snapshotPublishTagName\(snapshotPublishPromptTitle\(\)\)/);
  assert.match(js, /ref: 'refs\/tags\/' \+ tagName/);
});

test('snapshot publish titles do not use mutable metadata registry', () => {
  const publish = readFileSync(new URL('../src/js/12-publish.js', import.meta.url), 'utf8');
  const history = readFileSync(
    new URL('../src/js/18-snapshot-history.js', import.meta.url),
    'utf8'
  );

  assert.equal(publish.includes('GitCMSSnapshotRegistry'), false);
  assert.equal(history.includes('SNAPSHOT_METADATA_BRANCH'), false);
  assert.equal(history.includes('SNAPSHOT_METADATA_PATH'), false);
  assert.equal(history.includes('snapshotHistoryRename'), false);
  assert.equal(history.includes('snapshots.json'), false);
});

test('snapshot history displays publish-time title parsed from tag slug', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /function snapshotHistoryTitleFromName\(name\)/);
  assert.match(js, /function snapshotHistoryTitleMarkup\(name\)/);
  assert.match(js, /snapshotHistoryTitleMarkup\(tag\.name\)/);
  assert.match(js, /snapshotHistoryDisplayDate\(tag\.name\)/);
});

test('README documents publish-time snapshot titles', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Snapshot publish titles/);
  assert.match(readme, /snapshot-YYYY-MM-DD-HHMMSS--safe-title/);
  assert.match(readme, /no rename/);
  assert.match(readme, /no metadata branch/);
});
