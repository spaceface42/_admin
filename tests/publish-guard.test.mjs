import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canPublishCompare,
  publishBlockedReason
} from '../src/lib/publish-utils.mjs';

test('canPublishCompare blocks missing compare data', () => {
  assert.equal(canPublishCompare(null), false);
  assert.match(publishBlockedReason(null), /could not be loaded/i);
});

test('canPublishCompare blocks nothing-to-publish compare', () => {
  const compare = { ahead_by: 0, files: [] };
  assert.equal(canPublishCompare(compare), false);
  assert.match(publishBlockedReason(compare), /nothing to publish/i);
});

test('canPublishCompare blocks ahead_by zero even with stale file list', () => {
  const compare = {
    ahead_by: 0,
    files: [{ status: 'modified', filename: 'docs/index.html' }]
  };
  assert.equal(canPublishCompare(compare), false);
});

test('canPublishCompare allows positive ahead_by', () => {
  const compare = {
    ahead_by: 1,
    files: [{ status: 'modified', filename: 'docs/index.html' }]
  };
  assert.equal(canPublishCompare(compare), true);
  assert.equal(publishBlockedReason(compare), '');
});

test('canPublishCompare falls back to file count when ahead_by is absent', () => {
  assert.equal(canPublishCompare({ files: [{ filename: 'a.html' }] }), true);
  assert.equal(canPublishCompare({ files: [] }), false);
});
