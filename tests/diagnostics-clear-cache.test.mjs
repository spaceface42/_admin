import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCachedRepo } from '../src/lib/content-source-utils.mjs';

test('clearCachedRepo removes local cached SHAs for current repo only', () => {
  const input = {
    'spaceface42/_blackhole:content': { sha: 'content-sha', t: 1 },
    'spaceface42/_blackhole:main': { sha: 'main-sha', t: 1 },
    'spaceface42/_admin:main': { sha: 'admin-sha', t: 1 }
  };

  const out = clearCachedRepo(input, {
    owner: 'spaceface42',
    repo: '_blackhole'
  });

  assert.equal(out['spaceface42/_blackhole:content'], undefined);
  assert.equal(out['spaceface42/_blackhole:main'], undefined);
  assert.deepEqual(out['spaceface42/_admin:main'], { sha: 'admin-sha', t: 1 });
});
