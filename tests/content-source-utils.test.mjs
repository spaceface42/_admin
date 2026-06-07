import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContentTreeSnapshot,
  cacheKey,
  cachedCommitIfFresh,
  choosePinnedCommit,
  clearCachedBranch,
  clearCachedRepo,
  findBlobInTree,
  normalizeBlobContent,
  repoKeyPrefix,
  writeCachedCommit
} from '../src/lib/content-source-utils.mjs';

test('cacheKey and repoKeyPrefix use owner/repo branch format', () => {
  assert.equal(
    cacheKey({ owner: 'spaceface42', repo: '_blackhole', branch: 'content' }),
    'spaceface42/_blackhole:content'
  );
  assert.equal(
    repoKeyPrefix({ owner: 'spaceface42', repo: '_blackhole' }),
    'spaceface42/_blackhole:'
  );
});

test('writeCachedCommit writes immutable cache entry', () => {
  const oldData = { 'a/b:main': { sha: 'old', t: 1 } };
  const next = writeCachedCommit(oldData, {
    owner: 'a',
    repo: 'b',
    branch: 'content',
    sha: 'new',
    now: 10
  });

  assert.equal(oldData['a/b:content'], undefined);
  assert.deepEqual(next['a/b:content'], { sha: 'new', t: 10 });
});

test('cachedCommitIfFresh respects ttl', () => {
  assert.equal(cachedCommitIfFresh({ sha: 'abc', t: 100 }, { now: 150, ttlMs: 100 }), 'abc');
  assert.equal(cachedCommitIfFresh({ sha: 'abc', t: 100 }, { now: 250, ttlMs: 100 }), '');
});

test('clearCachedBranch removes only one branch', () => {
  const next = clearCachedBranch(
    {
      'a/b:content': { sha: '1', t: 1 },
      'a/b:main': { sha: '2', t: 1 }
    },
    { owner: 'a', repo: 'b', branch: 'content' }
  );

  assert.equal(next['a/b:content'], undefined);
  assert.equal(next['a/b:main'].sha, '2');
});

test('clearCachedRepo removes all repo cache entries only', () => {
  const next = clearCachedRepo(
    {
      'a/b:content': { sha: '1', t: 1 },
      'a/b:main': { sha: '2', t: 1 },
      'x/y:content': { sha: '3', t: 1 }
    },
    { owner: 'a', repo: 'b' }
  );

  assert.equal(next['a/b:content'], undefined);
  assert.equal(next['a/b:main'], undefined);
  assert.equal(next['x/y:content'].sha, '3');
});

test('choosePinnedCommit prefers cached work branch commit', () => {
  assert.deepEqual(
    choosePinnedCommit({
      branch: 'content',
      workBranch: 'content',
      preferLastWrite: true,
      cachedSha: 'abc'
    }),
    { commitSha: 'abc', source: 'last successful write' }
  );
});

test('choosePinnedCommit falls back to branch ref when not applicable', () => {
  assert.deepEqual(
    choosePinnedCommit({
      branch: 'main',
      workBranch: 'content',
      preferLastWrite: true,
      cachedSha: 'abc'
    }),
    { commitSha: '', source: 'branch ref' }
  );
});

test('buildContentTreeSnapshot normalizes GitHub tree response', () => {
  const snapshot = buildContentTreeSnapshot({
    branch: 'content',
    commitSha: 'commit',
    treeSha: 'tree',
    source: 'branch ref',
    treeResponse: { tree: [{ path: 'docs/index.html', type: 'blob' }] }
  });

  assert.equal(snapshot.commitSha, 'commit');
  assert.deepEqual(snapshot.tree, [{ path: 'docs/index.html', type: 'blob' }]);
});

test('findBlobInTree returns matching blob only', () => {
  const tree = [
    { path: 'docs', type: 'tree' },
    { path: 'docs/index.html', type: 'blob', sha: 'abc' }
  ];
  assert.deepEqual(findBlobInTree(tree, 'docs/index.html'), {
    path: 'docs/index.html',
    type: 'blob',
    sha: 'abc'
  });
  assert.equal(findBlobInTree(tree, 'docs'), null);
});

test('normalizeBlobContent removes whitespace from base64 blob content', () => {
  assert.equal(normalizeBlobContent('abc\n def\r\n'), 'abcdef');
});
