/* ---------- HTML snippets ---------- */
function selectedEditorText(){
  const ta=el('htmlArea');
  const start=ta.selectionStart ?? 0;
  const end=ta.selectionEnd ?? 0;
  return EditorUtils.selectedText(ta.value,start,end);
}
function snippetTemplate(type,selection=''){
  return EditorUtils.snippetTemplate(type,selection);
}
function insertHtmlSnippet(type){
  const ta=el('htmlArea');
  if(!state.activeId || !ta) {
    toast('Select a fragment first','err');
    return;
  }
  const snippet=snippetTemplate(type,selectedEditorText());
  if(!snippet) return;
  insertAtCursor(ta,snippet);
  toast('Snippet inserted','ok');
}
