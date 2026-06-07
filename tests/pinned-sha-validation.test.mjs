import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseReadCommitFromCacheValidation } from '../src/lib/content-source-utils.mjs';

test('read commit uses branch ref when no cached SHA exists', () => {
  assert.deepEqual(
    chooseReadCommitFromCacheValidation({ branchSha: 'branch', cachedSha: '', cacheAheadBy: null }),
    { commitSha: 'branch', source: 'branch ref' }
  );
});

test('read commit accepts matching cached SHA without overriding branch', () => {
  assert.deepEqual(
    chooseReadCommitFromCacheValidation({ branchSha: 'same', cachedSha: 'same', cacheAheadBy: 0 }),
    { commitSha: 'same', source: 'branch ref + cached write' }
  );
});

test('read commit uses cached SHA only when compare proves it is ahead', () => {
  assert.deepEqual(
    chooseReadCommitFromCacheValidation({
      branchSha: 'old-branch',
      cachedSha: 'new-cache',
      cacheAheadBy: 1
    }),
    { commitSha: 'new-cache', source: 'last successful write' }
  );
});

test('read commit ignores stale cached SHA when it is not ahead', () => {
  assert.deepEqual(
    chooseReadCommitFromCacheValidation({
      branchSha: 'new-branch',
      cachedSha: 'old-cache',
      cacheAheadBy: 0
    }),
    { commitSha: 'new-branch', source: 'branch ref' }
  );
});
