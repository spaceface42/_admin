import test from 'node:test';
import assert from 'node:assert/strict';
import { contentsPath, updateRefPath } from '../src/lib/github-api-utils.mjs';

const githubPath = (path) =>
  String(path)
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map(encodeURIComponent)
    .join('/');

test('CMS write SHA reads explicitly use content branch ref', () => {
  const html = contentsPath({ path: 'docs/index.html', ref: 'content', githubPath });
  const manifest = contentsPath({ path: 'fragments.json', ref: 'content', githubPath });
  const config = contentsPath({ path: 'gitcms.config.json', ref: 'content', githubPath });

  assert.equal(html, '/contents/docs/index.html?ref=content');
  assert.equal(manifest, '/contents/fragments.json?ref=content');
  assert.equal(config, '/contents/gitcms.config.json?ref=content');
});

test('publish updates main ref directly', () => {
  assert.equal(updateRefPath('main'), '/git/refs/heads/main');
});
