import test from 'node:test';
import assert from 'node:assert/strict';
import { FragmentParser } from '../src/lib/fragment-parser.mjs';

const html = `<!doctype html>
<main>
<!-- cms:start hero -->
<section data-fragment="hero" data-label="Hero" class="fragment">
  <h1>Hello</h1>
  <section class="inner"><p>Nested</p></section>
</section>
<!-- cms:end hero -->
</main>`;

test('findMarkedFragments handles nested sections', () => {
  const frags = FragmentParser.findMarkedFragments(html);
  assert.equal(frags.length, 1);
  assert.equal(frags[0].id, 'hero');
  assert.match(frags[0].innerHTML, /Nested/);
});

test('replaceMarkedFragment replaces only the marked block inner HTML', () => {
  const out = FragmentParser.replaceMarkedFragment(html, 'hero', '<h1>Changed</h1>');
  assert.match(out, /<h1>Changed<\/h1>/);
  assert.doesNotMatch(out, /<h1>Hello<\/h1>/);
  assert.match(out, /<!-- cms:start hero -->/);
  assert.match(out, /<!-- cms:end hero -->/);
});

test('validateMarkers warns for missing end marker', () => {
  const warnings = FragmentParser.validateMarkers(
    '<!-- cms:start hero --><section data-fragment="hero">x</section>',
    'docs/index.html'
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /no matching cms:end/);
});
