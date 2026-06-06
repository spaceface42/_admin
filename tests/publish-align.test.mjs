import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignedCompareSummary,
  canPublishCompare,
  mergeResultSha
} from '../src/lib/publish-utils.mjs';

test('mergeResultSha reads SHA from GitHub merge result shape', () => {
  assert.equal(mergeResultSha({ sha: 'abc' }), 'abc');
  assert.equal(mergeResultSha({ commit: { sha: 'def' } }), 'def');
  assert.equal(mergeResultSha({ object: { sha: 'ghi' } }), 'ghi');
  assert.equal(mergeResultSha(null), '');
});

test('alignedCompareSummary creates non-publishable compare data', () => {
  const aligned = alignedCompareSummary();
  assert.deepEqual(aligned, { files: [], ahead_by: 0 });
  assert.equal(canPublishCompare(aligned), false);
});
