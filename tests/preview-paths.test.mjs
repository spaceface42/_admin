import test from 'node:test';
import assert from 'node:assert/strict';
import { PreviewPaths } from '../src/lib/preview-paths.mjs';

const ctx = {
  owner: 'spaceface42',
  repo: '_blackhole',
  ref: 'abc123',
  mediaPrefix: 'assets/media/',
  mediaDir: 'docs/assets/media',
  version: 123
};

test('resolveRepoRelativeUrl resolves relative assets from an HTML file', () => {
  assert.equal(
    PreviewPaths.resolveRepoRelativeUrl('assets/style.css', 'docs/index.html'),
    'docs/assets/style.css'
  );
});

test('resolveRepoRelativeUrl maps root-style site assets into docs', () => {
  assert.equal(
    PreviewPaths.resolveRepoRelativeUrl('/assets/media/photo.png', 'docs/index.html'),
    'docs/assets/media/photo.png'
  );
});

test('resolveRepoRelativeUrl keeps query and hash suffixes', () => {
  assert.equal(
    PreviewPaths.resolveRepoRelativeUrl('assets/app.css?v=1#top', 'docs/index.html'),
    'docs/assets/app.css?v=1#top'
  );
});

test('rawUrlForPreviewAsset creates raw GitHub URLs with cache bust', () => {
  assert.equal(
    PreviewPaths.rawUrlForPreviewAsset('assets/style.css', 'docs/index.html', ctx),
    'https://raw.githubusercontent.com/spaceface42/_blackhole/abc123/docs/assets/style.css?v=123'
  );
});

test('rewriteFragmentMediaUrls rewrites fragment media src paths', () => {
  const html = '<img src="assets/media/photo.png" alt="Photo">';
  const out = PreviewPaths.rewriteFragmentMediaUrls(html, ctx);
  assert.match(
    out,
    /raw\.githubusercontent\.com\/spaceface42\/_blackhole\/abc123\/docs\/assets\/media\/photo\.png\?v=123/
  );
});

test('rewriteFullPageAssetUrls rewrites CSS, images and srcset', () => {
  const html = `
    <link rel="stylesheet" href="assets/style.css">
    <img src="assets/media/a.png">
    <img srcset="assets/media/a.png 1x, assets/media/b.png 2x">
  `;
  const out = PreviewPaths.rewriteFullPageAssetUrls(html, 'docs/index.html', ctx);
  assert.match(out, /docs\/assets\/style\.css\?v=123/);
  assert.match(out, /docs\/assets\/media\/a\.png\?v=123/);
  assert.match(out, /docs\/assets\/media\/b\.png\?v=123 2x/);
});

test('rewriteFullPageAssetUrls does not rewrite normal page links', () => {
  const html = '<a href="contact.html">Contact</a>';
  assert.equal(PreviewPaths.rewriteFullPageAssetUrls(html, 'docs/index.html', ctx), html);
});

test('external and special URLs are not rewritten', () => {
  const html =
    '<img src="https://example.com/a.png"><a href="#top">Top</a><img src="data:image/png;base64,aaa">';
  assert.equal(PreviewPaths.rewriteFullPageAssetUrls(html, 'docs/index.html', ctx), html);
});
