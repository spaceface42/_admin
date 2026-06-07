import test from 'node:test';
import assert from 'node:assert/strict';
import { effectivePublishSha } from '../src/lib/publish-utils.mjs';

test('effectivePublishSha prefers pinned content SHA', () => {
  assert.equal(
    effectivePublishSha({
      headRef: { object: { sha: 'branch-sha' } },
      pinnedHeadSha: 'pinned-sha'
    }),
    'pinned-sha'
  );
});

test('effectivePublishSha falls back to content branch ref SHA', () => {
  assert.equal(
    effectivePublishSha({
      headRef: { object: { sha: 'branch-sha' } },
      pinnedHeadSha: ''
    }),
    'branch-sha'
  );
});
