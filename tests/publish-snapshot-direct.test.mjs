import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('publish module creates snapshot tags directly after successful publish', () => {
  const source = readFileSync(new URL('../src/js/12-publish.js', import.meta.url), 'utf8');

  assert.match(source, /SNAPSHOT_TAG_PREFIX = 'snapshot-'/);
  assert.match(source, /function snapshotTagName/);
  assert.match(source, /async function createSnapshotTagForPublish\(sha\)/);
  assert.match(source, /GitHubApi\.request\(GitHubApi\.repoPath\('\/git\/refs'\)/);
  assert.match(source, /ref: 'refs\/tags\/' \+ tagName/);
});

test('doPublish uses publish result SHA to create snapshot before success toast', () => {
  const source = readFileSync(new URL('../src/js/12-publish.js', import.meta.url), 'utf8');

  assert.match(source, /const publishResult = await publishContentToMain\(\)/);
  assert.match(source, /snapshotTag = await createSnapshotAfterPublishResult\(publishResult\)/);
  assert.match(source, /Published — main now matches content\. Snapshot:/);
});

test('publish snapshots are not implemented by wrapping buttons', () => {
  const source = readFileSync(new URL('../src/js/12-publish.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /snapshotPublishWrappedClick/);
  assert.doesNotMatch(source, /const original = btn\.onclick/);
});
