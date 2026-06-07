import test from 'node:test';
import assert from 'node:assert/strict';
import { Paths } from '../src/lib/paths.mjs';

test('normalizeRepoPath trims slashes and repeated separators', () => {
  assert.equal(Paths.normalizeRepoPath('/docs//assets/media/'), 'docs/assets/media');
});

test('publicPathToRepoPath maps public assets to docs assets', () => {
  assert.equal(Paths.publicPathToRepoPath('assets/style.css'), 'docs/assets/style.css');
  assert.equal(Paths.publicPathToRepoPath('docs/assets/style.css'), 'docs/assets/style.css');
});

test('mediaPublicUrl uses relative prefix', () => {
  assert.equal(
    Paths.mediaPublicUrl('docs/assets/media/photo.jpg', 'assets/media/'),
    'assets/media/photo.jpg'
  );
});

test('githubPath encodes each path segment', () => {
  assert.equal(Paths.githubPath('docs/a b/한글.html'), 'docs/a%20b/%ED%95%9C%EA%B8%80.html');
});
