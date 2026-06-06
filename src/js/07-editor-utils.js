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

  function snippetTemplate(type, selection = '') {
    const text = String(selection || '').trim();

    switch (type) {
      case 'p':
        return `<p>${escapeHtml(text || 'New paragraph')}</p>`;
      case 'h2':
        return `<h2>${escapeHtml(text || 'New heading')}</h2>`;
      case 'lede':
        return `<p class="lede">${escapeHtml(text || 'Intro text')}</p>`;
      case 'button':
        return `<a class="btn" href="contact.html">${escapeHtml(text || 'Call to action')}</a>`;
      case 'list':
        if (text) {
          const items = text
            .split(/\n+/)
            .map(item => item.trim())
            .filter(Boolean);
          return `<ul>\n${items.map(item => `  <li>${escapeHtml(item)}</li>`).join('\n')}\n</ul>`;
        }
        return `<ul>\n  <li>First item</li>\n  <li>Second item</li>\n</ul>`;
      case 'card':
        return `<div class="card">\n  <h3>${escapeHtml(text || 'Card title')}</h3>\n  <p>Card text.</p>\n</div>`;
      default:
        return '';
    }
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
      ? manifest.find(item => item && item.id === fragment.id)
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
    snippetTemplate,
    imgTag,
    computeCursorInsertion,
    resetFragmentValues
  });
})();
