/* ---------- prefill + auto-connect ---------- */
(function init() {
  const r = localStorage.getItem(LS_REPO),
    t = TokenStorage.read();
  if (r) el('repoUrl').value = r;
  if (t) {
    try {
      el('token').value = dec(t);
    } catch (e) {}
  }
  // If both repo and token are already known, skip the login screen entirely.
  if (r && t) connect();
})();

// Render default editor snippets after all modules, including EditorUtils, are initialized.
// Config-loaded refreshes still happen after connect/settings save.
if (typeof renderEditorSnippetControls === 'function') {
  renderEditorSnippetControls();
}
