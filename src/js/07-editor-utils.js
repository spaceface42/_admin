/* ---------- editor utility helpers ---------- */
const EditorUtils = (() => {
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttrLocal(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
  }

  function selectedText(value, start = 0, end = 0) {
    return String(value || '').slice(start, end);
  }

  const DEFAULT_EDITOR_SNIPPETS = Object.freeze([
    {
      id: 'p',
      label: 'Paragraph',
      hint: '<p>',
      quick: true,
      html: '<p>{{text|New paragraph}}</p>'
    },
    {
      id: 'h2',
      label: 'Heading',
      hint: '<h2>',
      quick: true,
      html: '<h2>{{text|New heading}}</h2>'
    },
    {
      id: 'button',
      label: 'Button link',
      hint: '<a class="btn">',
      quick: true,
      html: '<a class="btn" href="contact.html">{{text|Call to action}}</a>'
    },
    {
      id: 'image',
      label: 'Image',
      hint: '<img>',
      quick: true,
      html: '<img src="assets/media/image.jpg" alt="{{attr:text|Image description}}">'
    },
    {
      id: 'lede',
      label: 'Intro text',
      hint: '<p class="lede">',
      quick: false,
      html: '<p class="lede">{{text|Intro text}}</p>'
    },
    {
      id: 'list',
      label: 'List',
      hint: '<ul>',
      quick: false,
      html: '<ul>\n{{items|First item\nSecond item}}\n</ul>'
    },
    {
      id: 'card',
      label: 'Card',
      hint: '<div class="card">',
      quick: false,
      html: '<div class="card">\n  <h3>{{text|Card title}}</h3>\n  <p>Card text.</p>\n</div>'
    },
    {
      id: 'section',
      label: 'Section wrapper',
      hint: '<section>',
      quick: false,
      html: '<section class="section">\n  <div class="container">\n    <h2>{{text|Section heading}}</h2>\n    <p>Section text.</p>\n  </div>\n</section>'
    },
    {
      id: 'columns',
      label: 'Two columns',
      hint: '<div class="columns">',
      quick: false,
      html: '<div class="columns">\n  <div>\n    <h3>{{text|First column}}</h3>\n    <p>Column text.</p>\n  </div>\n  <div>\n    <h3>Second column</h3>\n    <p>Column text.</p>\n  </div>\n</div>'
    },
    {
      id: 'quote',
      label: 'Quote',
      hint: '<blockquote>',
      quick: false,
      html: '<blockquote>\n  <p>{{text|Quote text.}}</p>\n</blockquote>'
    }
  ]);

  function configEditorSnippets(config) {
    const editor =
      config && typeof config === 'object' && !Array.isArray(config) ? config.editor : null;
    const snippets =
      editor && typeof editor === 'object' && !Array.isArray(editor) ? editor.snippets : null;
    return Array.isArray(snippets) ? snippets : [];
  }

  function normalizeSnippetDefinition(snippet) {
    if (!snippet || typeof snippet !== 'object' || Array.isArray(snippet)) return null;

    const id = String(snippet.id || '').trim();
    const label = String(snippet.label || id).trim();
    const html = String(snippet.html || '').trim();

    if (!id || !label || !html) return null;

    return {
      id,
      label,
      hint: String(snippet.hint || snippet.description || '').trim(),
      quick: snippet.quick === true,
      html
    };
  }

  function editorSnippetDefinitions(config = null) {
    const byId = new Map();

    for (const snippet of DEFAULT_EDITOR_SNIPPETS) {
      byId.set(snippet.id, { ...snippet });
    }

    for (const snippet of configEditorSnippets(config)) {
      const normalized = normalizeSnippetDefinition(snippet);
      if (!normalized) continue;
      byId.set(normalized.id, normalized);
    }

    return [...byId.values()];
  }

  function renderSnippetTemplate(template, selection = '') {
    const selected = String(selection || '').trim();

    const withItems = String(template || '').replace(
      /\{\{items(?:\|([^}]*))?\}\}/g,
      (match, fallback = '') => {
        const value = selected || fallback;
        const items = String(value || '')
          .split(/\n+/)
          .map((item) => item.trim())
          .filter(Boolean);
        return items.length ? items.map((item) => `  <li>${escapeHtml(item)}</li>`).join('\n') : '';
      }
    );

    return withItems.replace(
      /\{\{(attr:)?text(?:\|([^}]*))?\}\}/g,
      (match, attrPrefix, fallback = '') => {
        const value = selected || fallback;
        return attrPrefix ? escapeAttrLocal(value) : escapeHtml(value);
      }
    );
  }

  function snippetTemplate(type, selection = '', config = null) {
    const id = String(type || '').trim();
    const snippet = editorSnippetDefinitions(config).find((item) => item.id === id);
    return snippet ? renderSnippetTemplate(snippet.html, selection) : '';
  }

  function imgTag({ url, alt = '' }) {
    return `<img src="${escapeAttrLocal(url)}" alt="${escapeAttrLocal(alt)}">`;
  }

  function computeCursorInsertion(value, selectionStart, selectionEnd, text) {
    const source = String(value || '');
    const start = Number.isFinite(selectionStart) ? selectionStart : source.length;
    const end = Number.isFinite(selectionEnd) ? selectionEnd : source.length;
    const before = source.slice(0, start);
    const after = source.slice(end);
    const spacerBefore = before && !before.endsWith('\n') ? '\n' : '';
    const spacerAfter = after && !after.startsWith('\n') ? '\n' : '';
    const insert = spacerBefore + String(text || '') + spacerAfter;

    return {
      value: before + insert + after,
      cursor: start + insert.length,
      inserted: insert
    };
  }

  function resetFragmentValues(fragment, manifest) {
    if (!fragment) return null;
    const entry = Array.isArray(manifest)
      ? manifest.find((item) => item && item.id === fragment.id)
      : null;
    return {
      ...fragment,
      innerHTML: fragment.origHTML,
      label: entry ? entry.label : fragment.id,
      dirty: false
    };
  }

  return Object.freeze({
    escapeHtml,
    selectedText,
    DEFAULT_EDITOR_SNIPPETS,
    configEditorSnippets,
    normalizeSnippetDefinition,
    editorSnippetDefinitions,
    renderSnippetTemplate,
    snippetTemplate,
    imgTag,
    computeCursorInsertion,
    resetFragmentValues
  });
})();
