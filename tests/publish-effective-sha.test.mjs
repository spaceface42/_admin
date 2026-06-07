import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveHeadSha, refsOrPinnedPointToSameSha } from '../src/lib/publish-utils.mjs';

test('effectiveHeadSha prefers pinned SHA over stale branch ref', () => {
  assert.equal(
    effectiveHeadSha({
      headRef: { object: { sha: 'old' } },
      pinnedSha: 'new'
    }),
    'new'
  );
});

test('effectiveHeadSha falls back to branch ref SHA', () => {
  assert.equal(
    effectiveHeadSha({
      headRef: { object: { sha: 'branch' } },
      pinnedSha: ''
    }),
    'branch'
  );
});

test('refsOrPinnedPointToSameSha compares main against pinned content SHA', () => {
  assert.equal(
    refsOrPinnedPointToSameSha({
      baseRef: { object: { sha: 'main' } },
      headRef: { object: { sha: 'stale-main' } },
      pinnedHeadSha: 'new-content'
    }),
    false
  );

  assert.equal(
    refsOrPinnedPointToSameSha({
      baseRef: { object: { sha: 'main' } },
      headRef: { object: { sha: 'old' } },
      pinnedHeadSha: 'main'
    }),
    true
  );
});
