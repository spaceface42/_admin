import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snapshot history stores names in registry metadata, not by renaming tags', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.ok(js.includes("const SNAPSHOT_METADATA_PATH = '.gitcms/snapshots.json'"));
  assert.ok(js.includes("const SNAPSHOT_METADATA_BRANCH = 'gitcms-metadata'"));
  assert.ok(js.includes('function snapshotHistoryDisplayName(tag, metadata)'));
  assert.ok(js.includes('async function snapshotHistoryLoadMetadata()'));
  assert.ok(js.includes('async function snapshotHistorySaveMetadata(metadataState, metadata)'));
  assert.ok(js.includes('async function snapshotHistoryRename(tag)'));
  assert.ok(js.includes('data-action="rename"'));
  assert.ok(js.includes('snapshotHistoryRename(tag)'));
  assert.ok(js.includes('Git tag names stay unchanged'));
});

test('snapshot metadata is a synchronized registry of live snapshot tags', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.ok(js.includes('function snapshotHistoryReconcileMetadata(tags, metadata)'));
  assert.ok(js.includes('const liveTags = new Set()'));
  assert.ok(js.includes('next.snapshots[tag.name] = entry'));
  assert.ok(js.includes('if (!liveTags.has(oldTag)) changed = true'));
  assert.ok(js.includes('async function snapshotHistoryLoadSyncedMetadata(tags)'));
});

test('snapshot history refresh reconciles registry before rendering', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');
  const refreshStart = js.indexOf('async function snapshotHistoryRefresh');
  const refreshEnd = js.indexOf('async function snapshotHistoryRefreshEditorAfterRollback', refreshStart);
  const refreshBody = js.slice(refreshStart, refreshEnd);

  assert.ok(refreshBody.includes('const tags = await snapshotHistoryListTags()'));
  assert.ok(refreshBody.includes('snapshotHistoryLoadSyncedMetadata(tags)'));
  assert.ok(refreshBody.includes('snapshotHistoryRender(tags, metadataState.metadata)'));
});

test('snapshot rename updates registry entry without renaming Git tag', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');
  const renameStart = js.indexOf('async function snapshotHistoryRename');
  const renameEnd = js.indexOf('async function snapshotHistoryDelete', renameStart);
  const renameBody = js.slice(renameStart, renameEnd);

  assert.ok(renameBody.includes('snapshotHistoryLoadSyncedMetadata(tags)'));
  assert.ok(renameBody.includes('snapshotHistorySetSnapshotName'));
  assert.ok(renameBody.includes('snapshotHistorySaveMetadata'));
  assert.equal(renameBody.includes('/git/refs/tags'), false);
  assert.equal(renameBody.includes('updateRef'), false);
});

test('snapshot delete removes Git tag and registry entry without moving branches', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');
  const deleteStart = js.indexOf('async function snapshotHistoryDelete');
  const deleteEnd = js.indexOf('function snapshotHistoryRender', deleteStart);
  const deleteBody = js.slice(deleteStart, deleteEnd);

  assert.ok(deleteBody.includes('/git/refs/tags/'));
  assert.ok(deleteBody.includes("method: 'DELETE'"));
  assert.ok(deleteBody.includes('snapshotHistoryRemoveSnapshot'));
  assert.ok(deleteBody.includes('snapshotHistorySaveMetadata'));
  assert.equal(deleteBody.includes('updateRef'), false);
});

test('snapshot metadata validation keeps names plain and bounded', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.ok(js.includes('const SNAPSHOT_NAME_MAX_LENGTH = 80'));
  assert.ok(js.includes('function snapshotHistoryValidateName(name)'));
  assert.ok(js.includes('Snapshot names must be plain text'));
});

test('snapshot metadata branch is metadata-only', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');
  const createStart = js.indexOf('async function snapshotHistoryCreateMetadataOnlyBranch');
  const ensureStart = js.indexOf('async function snapshotHistoryEnsureMetadataBranch');
  const createBody = js.slice(createStart, ensureStart);

  assert.ok(createBody.includes('/git/blobs'));
  assert.ok(createBody.includes('/git/trees'));
  assert.ok(createBody.includes('/git/commits'));
  assert.ok(createBody.includes('refs/heads/'));
  assert.ok(createBody.includes('path: SNAPSHOT_METADATA_PATH'));
  assert.equal(createBody.includes('createBranchFromSha(SNAPSHOT_METADATA_BRANCH'), false);
});

test('README documents named snapshot registry', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Named snapshots/i);
  assert.match(readme, /snapshot registry/i);
  assert.match(readme, /gitcms-metadata/);
  assert.match(readme, /\.gitcms\/snapshots\.json/);
  assert.match(readme, /Git tag names stay unchanged/);
});
