import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snippet toolbar and help panel render from dynamic containers', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="quickSnippetButtons"/);
  assert.match(html, /id="editorSnippetGrid"/);
  assert.doesNotMatch(html, /data-snippet="columns"><b>Two columns/);
});

test('snippet runtime uses gitcmsConfig', () => {
  const js = readFileSync(new URL('../src/js/05-snippets.js', import.meta.url), 'utf8');
  assert.match(js, /editorSnippetConfig/);
  assert.match(js, /EditorUtils\.editorSnippetDefinitions/);
  assert.match(js, /renderEditorSnippetControls/);
});
