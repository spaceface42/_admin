import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('media thumbnails use Contents API instead of manifest-first tree/blob reads', () => {
  const media = readFileSync(new URL('../src/js/09-media.js', import.meta.url), 'utf8');

  assert.match(media, /async function loadMediaThumb/);
  assert.match(media, /GitHubApi\.getContent\(item\.path,\s*state\.workBranch\)/);
  assert.doesNotMatch(media, /GitHubApi\.getFile\(item\.path,\s*state\.workBranch\)/);
});
