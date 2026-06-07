/* ---------- preview rendering ---------- */

let previewBlobUrl = null;

function previewPathContext() {
  return {
    owner: state.owner,
    repo: state.repo,
    ref: contentAssetRef(),
    mediaPrefix: mediaPrefix(),
    mediaDir: mediaDir(),
    version: Date.now()
  };
}

function rewritePreviewUrls(html) {
  return PreviewPaths.rewriteFragmentMediaUrls(html, previewPathContext());
}

function rewriteFullPageAssetUrls(pageHtml, filePath) {
  return PreviewPaths.rewriteFullPageAssetUrls(pageHtml, filePath, previewPathContext());
}

function updatePreviewModeButtons() {
  const fragBtn = el('previewFragmentBtn');
  const pageBtn = el('previewPageBtn');
  if (!fragBtn || !pageBtn) return;
  fragBtn.classList.toggle('active', state.previewMode === 'fragment');
  pageBtn.classList.toggle('active', state.previewMode === 'page');
}

function previewShell(body, { title = 'GitCMS Preview', extraHead = '' } = {}) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    ${extraHead}
    <style>
      html,body{min-height:100%;margin:0}
      body{font-family:system-ui,sans-serif;color:#1a1a1a;padding:24px;box-sizing:border-box;background:#fff}
      img{max-width:100%;height:auto}
      *{box-sizing:border-box}
      .gitcms-preview-error{border:1px solid #f59e0b;background:#fffbeb;color:#78350f;border-radius:10px;padding:14px 16px;line-height:1.45}
      .gitcms-preview-error h2{margin:0 0 8px;font-size:18px}
      .gitcms-preview-error pre{white-space:pre-wrap;font-size:12px;overflow:auto}
    </style>
    <title>${esc(title)}</title></head><body>${body}</body></html>`;
}

function previewErrorDoc(title, message, details = '') {
  return previewShell(
    `<div class="gitcms-preview-error"><h2>${esc(title)}</h2><p>${esc(message)}</p>${details ? `<pre>${esc(details)}</pre>` : ''}</div>`,
    { title }
  );
}

function buildFragmentPreview(f) {
  try {
    if (!f) return previewErrorDoc('No fragment selected', 'Select a fragment to preview it.');
    return previewShell(rewritePreviewUrls(rebuildFragment(f)), {
      title: `Preview ${f.id}`,
      extraHead: previewCssTags()
    });
  } catch (e) {
    console.error('Fragment preview failed', e);
    return previewErrorDoc('Fragment preview failed', e.message || String(e));
  }
}

function buildPagePreview(f) {
  try {
    if (!f) return previewErrorDoc('No fragment selected', 'Select a fragment to preview it.');
    const fileRec = state.files.get(f.path);
    if (!fileRec) return buildFragmentPreview(f);

    let page = fileRec.content;
    try {
      page = replaceFragment(page, f);
    } catch (e) {
      return previewErrorDoc(
        'Page preview failed',
        e.message || String(e),
        'Falling back to Fragment mode usually still works.'
      );
    }

    page = rewriteFullPageAssetUrls(page, f.path);

    // Keep scripts inert even if the iframe sandbox changes later.
    page = page.replace(/<script\b/gi, '<script type="text/plain" data-gitcms-disabled');

    // Add a small safety style and selected-fragment outline without depending on site CSS.
    page = page.replace(
      '</head>',
      `<style>
      img{max-width:100%;height:auto}
      [data-fragment="${escAttr(f.id)}"], #${escAttr(f.id)}{outline:2px dashed rgba(37,99,235,.55);outline-offset:6px}
    </style></head>`
    );

    return page;
  } catch (e) {
    console.error('Page preview failed', e);
    return previewErrorDoc('Page preview failed', e.message || String(e));
  }
}

function setPreviewDocument(html) {
  const frame = el('preview');
  if (!frame) return;

  try {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      previewBlobUrl = null;
    }

    const blob = new Blob([html], { type: 'text/html' });
    previewBlobUrl = URL.createObjectURL(blob);

    // Clear srcdoc so browser does not prefer stale srcdoc over blob URL.
    frame.removeAttribute('srcdoc');
    frame.src = previewBlobUrl;
  } catch (e) {
    console.error('Blob preview failed, falling back to srcdoc', e);
    frame.removeAttribute('src');
    frame.srcdoc = html;
  }
}

function updatePreview(f) {
  updatePreviewModeButtons();

  try {
    // Keep the active fragment synced before building preview.
    if (f && state.activeId === f.id && el('htmlArea')) {
      f.innerHTML = el('htmlArea').value;
      f.label = el('edLabel').value.trim() || f.id;
    }

    const html = state.previewMode === 'page' ? buildPagePreview(f) : buildFragmentPreview(f);
    setPreviewDocument(html);
  } catch (e) {
    console.error('Preview update failed', e);
    setPreviewDocument(previewErrorDoc('Preview update failed', e.message || String(e)));
  }
}
