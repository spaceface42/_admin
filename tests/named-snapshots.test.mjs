import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snapshot history stores human-readable names as metadata, not tag renames', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /const SNAPSHOT_METADATA_PATH = '\.gitcms\/snapshots\.json'/);
  assert.match(js, /function snapshotHistoryDisplayName\(tag, metadata\)/);
  assert.match(js, /async function snapshotHistoryLoadMetadata\(\)/);
  assert.match(js, /async function snapshotHistorySaveMetadata\(metadataState, metadata\)/);
  assert.match(js, /async function snapshotHistoryRename\(tag\)/);
  assert.match(js, /data-action="rename"/);
  assert.match(js, /snapshotHistoryRename\(tag\)/);
  assert.match(js, /Git tag names stay unchanged/);
});

test('snapshot rename commits only snapshots.json on the work branch', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  const renameStart = js.indexOf('async function snapshotHistoryRename');
  const renameEnd = js.indexOf('async function snapshotHistoryDelete', renameStart);
  const renameBody = js.slice(renameStart, renameEnd);

  assert.match(renameBody, /snapshotHistorySetSnapshotName/);
  assert.match(renameBody, /snapshotHistorySaveMetadata/);
  assert.doesNotMatch(renameBody, /\/git\/refs\/tags/);
  assert.doesNotMatch(renameBody, /updateRef/);
});

test('snapshot metadata validation keeps names plain and bounded', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /const SNAPSHOT_NAME_MAX_LENGTH = 80/);
  assert.match(js, /function snapshotHistoryValidateName\(name\)/);
  assert.match(js, /\[<>\]/);
  assert.match(js, /Snapshot names must be plain text/);
});

test('README documents named snapshots', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Named snapshots/);
  assert.match(readme, /\.gitcms\/snapshots\.json/);
  assert.match(readme, /Git tag names stay unchanged/);
});
