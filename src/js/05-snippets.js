/* ---------- HTML snippets ---------- */
function editorSnippetConfig(){
  return typeof gitcmsConfig !== 'undefined' ? gitcmsConfig : null;
}

function editorSnippetDefinitions(){
  return EditorUtils.editorSnippetDefinitions(editorSnippetConfig());
}

function selectedEditorText(){
  const ta=el('htmlArea');
  const start=ta.selectionStart ?? 0;
  const end=ta.selectionEnd ?? 0;
  return EditorUtils.selectedText(ta.value,start,end);
}

function snippetTemplate(type,selection=''){
  return EditorUtils.snippetTemplate(type,selection,editorSnippetConfig());
}

function renderEditorSnippetControls(){
  const quick=el('quickSnippetButtons');
  const grid=el('editorSnippetGrid');
  if(!quick || !grid) return;

  const snippets=editorSnippetDefinitions();
  const quickSnippets=snippets.filter(s=>s.quick);

  quick.innerHTML=quickSnippets.map(snippet=>
    `<button class="snippet-btn" type="button" data-snippet="${escAttr(snippet.id)}">${esc(snippet.label)}</button>`
  ).join('');

  grid.innerHTML=snippets.map(snippet=>{
    const hint=snippet.hint || snippet.id;
    return `<button type="button" data-snippet="${escAttr(snippet.id)}">`+
      `<b>${esc(snippet.label)}</b><span>${esc(hint)}</span></button>`;
  }).join('');
}

function insertHtmlSnippet(type){
  const ta=el('htmlArea');
  if(!state.activeId || !ta) {
    toast('Select a fragment first','err');
    return;
  }
  const snippet=snippetTemplate(type,selectedEditorText());
  if(!snippet) {
    toast('Snippet not found','err');
    return;
  }
  insertAtCursor(ta,snippet);
  toast('Snippet inserted','ok');
}

