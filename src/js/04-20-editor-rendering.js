/* ---------- editor rendering ---------- */

function selectFragment(id) {
  if (state.activeId && state.activeId !== id) syncActiveFromTextarea();
  Store.setActiveFragment(id);
  const f = state.frags.get(id);
  el('emptyState').style.display = 'none';
  el('editorPane').style.display = 'flex';
  el('edId').textContent = '#' + f.id;
  el('edFile').textContent = f.path;
  el('edLabel').value = f.label;
  el('htmlArea').value = f.innerHTML;
  el('wrapInfo').textContent =
    f.mode === 'marker'
      ? `<!-- cms:start ${f.markerId || f.id} --> ${f.openTag} … ${f.closeTag || '</section>'} <!-- cms:end ${f.markerId || f.id} -->`
      : `${f.openTag} … ${f.closeTag || '</section>'}`;
  el('sbPath').textContent = f.path;
  updatePreview(f);
  updateUnsavedBar();
  // active highlight
  document
    .querySelectorAll('.frag-row')
    .forEach((r) => r.classList.toggle('active', r.dataset.id === id));
}

function syncActiveFromTextarea() {
  if (!state.activeId) return;
  Store.applyEditorValues(state.activeId, {
    html: el('htmlArea').value,
    label: el('edLabel').value
  });
}
