/* ---------- prefill ---------- */
(function init() {
  const repo = localStorage.getItem(LS_REPO);
  const token = TokenStorage.read();

  if (repo) el('repoUrl').value = repo;
  if (token) {
    try {
      el('token').value = dec(token);
    } catch (e) {}
  }

  // Keep repository/token prefill convenient, but require an explicit Connect click.
  // This avoids silently opening a repo with a restored session token on shared machines.
})();

// Render default editor snippets after all modules, including EditorUtils, are initialized.
// Config-loaded refreshes still happen after connect/settings save.
if (typeof renderEditorSnippetControls === 'function') {
  renderEditorSnippetControls();
}
