import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('top editor toolbar uses dynamic quick snippet container', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const toolbarStart = html.indexOf('<div class="snippet-bar">');
  const toolbarEnd = html.indexOf('</div>', toolbarStart);
  const toolbar = html.slice(toolbarStart, toolbarEnd);

  assert.match(toolbar, /id="quickSnippetButtons"/);
  assert.match(toolbar, /editorHelpToggle/);
  assert.doesNotMatch(toolbar, /data-snippet="columns"/);
  assert.doesNotMatch(toolbar, /data-snippet="section"/);
});

test('larger snippets are provided by default snippet definitions', () => {
  const js = readFileSync(new URL('../src/js/07-editor-utils.js', import.meta.url), 'utf8');

  assert.match(js, /id: 'columns'/);
  assert.match(js, /id: 'section'/);
  assert.match(js, /id: 'card'/);
  assert.match(js, /id: 'quote'/);
});
