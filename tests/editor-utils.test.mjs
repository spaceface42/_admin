import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCursorInsertion,
  imgTag,
  resetFragmentValues,
  selectedText,
  snippetTemplate
} from '../src/lib/editor-utils.mjs';

test('selectedText returns selected editor text', () => {
  assert.equal(selectedText('abcdef', 1, 4), 'bcd');
});

test('snippetTemplate escapes paragraph text', () => {
  assert.equal(snippetTemplate('p', '<hello>'), '<p>&lt;hello&gt;</p>');
});

test('snippetTemplate builds list from selected lines', () => {
  assert.equal(
    snippetTemplate('list', 'One\nTwo\n\nThree'),
    '<ul>\n  <li>One</li>\n  <li>Two</li>\n  <li>Three</li>\n</ul>'
  );
});

test('snippetTemplate returns default card', () => {
  assert.match(snippetTemplate('card', ''), /<div class="card">/);
  assert.match(snippetTemplate('card', ''), /Card title/);
});

test('imgTag escapes src and alt attributes', () => {
  assert.equal(
    imgTag({ url: 'assets/x"y.png', alt: 'A "quote"' }),
    '<img src="assets/x&quot;y.png" alt="A &quot;quote&quot;">'
  );
});

test('computeCursorInsertion adds newlines around inserted block', () => {
  const result = computeCursorInsertion('<p>A</p><p>B</p>', 8, 8, '<h2>X</h2>');
  assert.equal(result.value, '<p>A</p>\n<h2>X</h2>\n<p>B</p>');
  assert.equal(result.cursor, 20);
});

test('computeCursorInsertion replaces selected text', () => {
  const result = computeCursorInsertion('hello world', 6, 11, '<b>world</b>');
  assert.equal(result.value, 'hello \n<b>world</b>');
});

test('resetFragmentValues resets html and manifest label', () => {
  const result = resetFragmentValues(
    {
      id: 'hero',
      label: 'Changed',
      innerHTML: '<h1>Changed</h1>',
      origHTML: '<h1>Original</h1>',
      dirty: true
    },
    [{ id: 'hero', label: 'Hero Section' }]
  );

  assert.equal(result.innerHTML, '<h1>Original</h1>');
  assert.equal(result.label, 'Hero Section');
  assert.equal(result.dirty, false);
});
