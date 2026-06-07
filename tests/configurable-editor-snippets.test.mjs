import test from 'node:test';
import assert from 'node:assert/strict';
import {
  editorSnippetDefinitions,
  renderSnippetTemplate,
  snippetTemplate
} from '../src/lib/editor-utils.mjs';

test('default snippets remain available without config', () => {
  const snippets = editorSnippetDefinitions();
  assert.ok(snippets.some((snippet) => snippet.id === 'p' && snippet.quick));
  assert.ok(snippets.some((snippet) => snippet.id === 'columns' && !snippet.quick));
});

test('config snippets add custom snippets', () => {
  const config = {
    editor: {
      snippets: [
        {
          id: 'alert',
          label: 'Alert box',
          hint: '<div class="alert">',
          quick: true,
          html: '<div class="alert">{{text|Alert text}}</div>'
        }
      ]
    }
  };

  const snippets = editorSnippetDefinitions(config);
  assert.ok(snippets.some((snippet) => snippet.id === 'alert' && snippet.quick));
  assert.equal(snippetTemplate('alert', 'Careful', config), '<div class="alert">Careful</div>');
});

test('config snippets override built-in snippets by id', () => {
  const config = {
    editor: {
      snippets: [
        {
          id: 'p',
          label: 'Custom paragraph',
          quick: true,
          html: '<p class="custom">{{text|Fallback}}</p>'
        }
      ]
    }
  };

  assert.equal(snippetTemplate('p', '', config), '<p class="custom">Fallback</p>');
});

test('renderSnippetTemplate escapes text and attribute placeholders', () => {
  assert.equal(
    renderSnippetTemplate(
      '<img alt="{{attr:text|A quote}}"><p>{{text|Body}}</p>',
      'A "quote" & <tag>'
    ),
    '<img alt="A &quot;quote&quot; &amp; &lt;tag&gt;"><p>A "quote" &amp; &lt;tag&gt;</p>'
  );
});
