/* ---------- editing events ---------- */

el('previewFragmentBtn').onclick=()=>{
  state.previewMode='fragment';
  const f=state.frags.get(state.activeId);
  if(f) updatePreview(f);
};
el('previewPageBtn').onclick=()=>{
  state.previewMode='page';
  const f=state.frags.get(state.activeId);
  if(f) updatePreview(f);
};


el('editorPane').addEventListener('click',event=>{
  const snippetBtn=event.target.closest('[data-snippet]');
  if(snippetBtn && el('editorPane').contains(snippetBtn)){
    insertHtmlSnippet(snippetBtn.dataset.snippet);
    return;
  }

  if(event.target.closest('#editorHelpToggle')){
    const panel=el('editorHelp');
    panel.open=!panel.open;
  }
});

el('htmlArea').addEventListener('input',()=>{
  const f=state.frags.get(state.activeId); if(!f) return;
  Store.applyEditorValues(f.id,{html:el('htmlArea').value,label:el('edLabel').value});
  updatePreview(f);
  reflectDirty(f);
});
el('edLabel').addEventListener('input',()=>{
  const f=state.frags.get(state.activeId); if(!f) return;
  Store.applyEditorValues(f.id,{html:el('htmlArea').value,label:el('edLabel').value});
  const row=document.querySelector(`.frag-row[data-id="${cssEsc(f.id)}"] .flabel`);
  if(row) row.textContent=f.label;
  reflectDirty(f);
});
function cssEsc(s){return (window.CSS&&CSS.escape)?CSS.escape(s):s.replace(/"/g,'\\"');}
function reflectDirty(f){
  const row=document.querySelector(`.frag-row[data-id="${cssEsc(f.id)}"]`);
  if(row) row.classList.toggle('dirty',f.dirty);
  const group=document.querySelector(`.file-group[data-path="${cssEsc(f.path)}"]`);
  if(group){
    const anyDirty=Store.dirtyFragmentIdsForFile(state.files.get(f.path)).length>0;
    group.classList.toggle('has-dirty',anyDirty);
  }
  updateUnsavedBar();
}

el('resetBtn').onclick=()=>{
  const f=state.frags.get(state.activeId); if(!f) return;
  const reset=EditorUtils.resetFragmentValues(f,state.manifest);
  Object.assign(f,reset);
  el('htmlArea').value=f.innerHTML;
  el('edLabel').value=f.label;
  const row=document.querySelector(`.frag-row[data-id="${cssEsc(f.id)}"] .flabel`);
  if(row) row.textContent=f.label;
  updatePreview(f); reflectDirty(f);
  toast('Reset to last loaded version');
};
