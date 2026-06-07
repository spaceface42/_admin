/* ---------- status rendering ---------- */

function setStatus(txt, busy) {
  el('statusTxt').textContent = txt;
  el('refreshBtn').querySelector('svg').classList.toggle('spin', !!busy);
}

function updateUnsavedBar() {
  const anyDirty = [...state.frags.values()].some((f) => f.dirty);
  el('sbUnsaved').classList.toggle('show', anyDirty);
}
