import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blobPath,
  branchPath,
  comparePath,
  contentsPath,
  createRefBody,
  mergeBody,
  repoPath,
  requestBody,
  requestHeaders,
  treePath,
  updateRefBody,
  updateRefPath
} from '../src/lib/github-api-utils.mjs';

const githubPath = (path) =>
  String(path)
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map(encodeURIComponent)
    .join('/');

test('repoPath builds repository API root plus optional path', () => {
  assert.equal(
    repoPath({ owner: 'spaceface42', repo: '_blackhole', path: '/contents/docs/index.html' }),
    '/repos/spaceface42/_blackhole/contents/docs/index.html'
  );
});

test('requestHeaders includes content-type only with body', () => {
  assert.deepEqual(requestHeaders({ token: 'abc', hasBody: false }), {
    Authorization: 'Bearer abc',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  });

  assert.equal(requestHeaders({ token: 'abc', hasBody: true })['Content-Type'], 'application/json');
});

test('requestBody serializes truthy body and omits empty body', () => {
  assert.equal(requestBody({ a: 1 }), '{"a":1}');
  assert.equal(requestBody(undefined), undefined);
});

test('branch/ref paths encode branch names', () => {
  assert.equal(branchPath('feature/test'), '/branches/feature%2Ftest');
  assert.equal(updateRefPath('feature/test'), '/git/refs/heads/feature%2Ftest');
});

test('createRefBody and updateRefBody produce GitHub payloads', () => {
  assert.deepEqual(createRefBody({ branch: 'content', sha: 'abc' }), {
    ref: 'refs/heads/content',
    sha: 'abc'
  });
  assert.deepEqual(updateRefBody({ sha: 'def', force: true }), {
    sha: 'def',
    force: true
  });
});

test('contentsPath supports optional ref', () => {
  assert.equal(
    contentsPath({ path: 'docs/index.html', ref: 'content', githubPath }),
    '/contents/docs/index.html?ref=content'
  );
  assert.equal(
    contentsPath({ path: 'docs/index.html', ref: '', githubPath }),
    '/contents/docs/index.html'
  );
});

test('git data and compare paths are encoded', () => {
  assert.equal(blobPath('abc/def'), '/git/blobs/abc%2Fdef');
  assert.equal(treePath('tree sha', { recursive: true }), '/git/trees/tree%20sha?recursive=1');
  assert.equal(
    comparePath({ base: 'main', head: 'feature/test' }),
    '/compare/main...feature%2Ftest'
  );
});

test('mergeBody preserves GitHub merge payload shape', () => {
  assert.deepEqual(mergeBody({ base: 'main', head: 'content', commit_message: 'publish' }), {
    base: 'main',
    head: 'content',
    commit_message: 'publish'
  });
});
