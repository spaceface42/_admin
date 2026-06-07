/* ---------- prefill ---------- */
(function init(){
  const r=localStorage.getItem(LS_REPO), t=localStorage.getItem(LS_TOKEN);
  if(r) el('repoUrl').value=r;
  if(t){ try{ el('token').value=dec(t); }catch(e){} }
})();

// Render default editor snippets after all modules, including EditorUtils, are initialized.
// Config-loaded refreshes still happen after connect/settings save.
if(typeof renderEditorSnippetControls === 'function'){
  renderEditorSnippetControls();
}
