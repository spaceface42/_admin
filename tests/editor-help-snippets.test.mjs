import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snippetTemplate } from '../src/lib/editor-utils.mjs';

test('snippetTemplate builds image snippet with escaped alt text', () => {
  assert.equal(
    snippetTemplate('image', 'A "quote"'),
    '<img src="assets/media/image.jpg" alt="A &quot;quote&quot;">'
  );
});

test('snippetTemplate builds section wrapper snippet', () => {
  const html = snippetTemplate('section', '');
  assert.match(html, /<section class="section">/);
  assert.match(html, /<div class="container">/);
});

test('snippetTemplate builds two-column snippet', () => {
  const html = snippetTemplate('columns', 'First');
  assert.match(html, /<div class="columns">/);
  assert.match(html, /First/);
  assert.match(html, /Second column/);
});

test('editor help panel uses dynamic snippet container', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="editorHelp"/);
  assert.match(html, /HTML help \/ snippets/);
  assert.match(html, /id="editorSnippetGrid"/);
  assert.match(html, /id="quickSnippetButtons"/);
});
