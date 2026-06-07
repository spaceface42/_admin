import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveBaseSha, refsOrPinnedBranchesAligned } from '../src/lib/publish-utils.mjs';

test('effectiveBaseSha prefers pinned main SHA over stale main ref', () => {
  assert.equal(
    effectiveBaseSha({
      baseRef: { object: { sha: 'old-main' } },
      pinnedSha: 'new-main'
    }),
    'new-main'
  );
});

test('refsOrPinnedBranchesAligned uses pinned SHAs for both branches', () => {
  assert.equal(
    refsOrPinnedBranchesAligned({
      baseRef: { object: { sha: 'old-main' } },
      headRef: { object: { sha: 'old-content' } },
      pinnedBaseSha: 'deployed',
      pinnedHeadSha: 'deployed'
    }),
    true
  );
});

test('refsOrPinnedBranchesAligned detects real mismatch using effective SHAs', () => {
  assert.equal(
    refsOrPinnedBranchesAligned({
      baseRef: { object: { sha: 'main' } },
      headRef: { object: { sha: 'content' } },
      pinnedBaseSha: '',
      pinnedHeadSha: 'new-content'
    }),
    false
  );
});
