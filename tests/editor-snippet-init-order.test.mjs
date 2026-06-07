import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snippets module does not call EditorUtils-dependent render before EditorUtils initializes', () => {
  const snippets = readFileSync(new URL('../src/js/05-snippets.js', import.meta.url), 'utf8');
  const prefill = readFileSync(new URL('../src/js/16-prefill.js', import.meta.url), 'utf8');

  assert.doesNotMatch(snippets, /\nrenderEditorSnippetControls\(\);\s*$/);
  assert.match(prefill, /renderEditorSnippetControls\(\)/);
});

test('built admin defines EditorUtils before initial snippet render call', () => {
  const built = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');

  const editorUtilsIndex = built.indexOf('const EditorUtils = (() =>');
  const initialRenderIndex = built.lastIndexOf('renderEditorSnippetControls();');

  assert.notEqual(editorUtilsIndex, -1);
  assert.notEqual(initialRenderIndex, -1);
  assert.ok(editorUtilsIndex < initialRenderIndex);
});
