import test from 'node:test';
import assert from 'node:assert/strict';
import { contentsPath } from '../src/lib/github-api-utils.mjs';

const githubPath = (path) =>
  String(path)
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map(encodeURIComponent)
    .join('/');

test('write-source contents path uses explicit content branch ref', () => {
  assert.equal(
    contentsPath({ path: 'docs/index.html', ref: 'content', githubPath }),
    '/contents/docs/index.html?ref=content'
  );
});

test('write-source contents path does not imply main fallback', () => {
  const path = contentsPath({ path: 'fragments.json', ref: 'content', githubPath });
  assert.equal(path.includes('main'), false);
  assert.equal(path.endsWith('?ref=content'), true);
});
