import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('snapshot registry exposes publish-time sync hook', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.ok(js.includes('async function snapshotHistorySyncRegistry()'));
  assert.ok(js.includes('async function snapshotHistorySyncRegistryAfterSnapshotCreate()'));
  assert.ok(js.includes('snapshotHistoryLoadSyncedMetadata(tags)'));
  assert.ok(js.includes('window.GitCMSSnapshotRegistry'));
  assert.ok(js.includes('syncAfterSnapshotCreate: snapshotHistorySyncRegistryAfterSnapshotCreate'));
});

test('publish path syncs snapshot registry after creating snapshot tag', () => {
  const dir = new URL('../src/js/', import.meta.url);
  const files = readdirSync(dir)
    .filter((name) => /^\d+-.+\.js$/.test(name))
    .map((name) => [name, readFileSync(new URL(name, dir), 'utf8')]);

  const publish = files.find(
    ([name, text]) =>
      name !== '18-snapshot-history.js' &&
      text.includes('async function syncSnapshotRegistryAfterSnapshotCreate()') &&
      text.includes('GitCMSSnapshotRegistry.syncAfterSnapshotCreate') &&
      text.includes('await syncSnapshotRegistryAfterSnapshotCreate();')
  );

  assert.ok(publish, 'Expected a publish module with snapshot registry sync hook');
});
