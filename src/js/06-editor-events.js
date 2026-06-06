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


document.querySelectorAll('[data-snippet]').forEach(btn=>{
  btn.addEventListener('click',()=>insertHtmlSnippet(btn.dataset.snippet));
});

el('htmlArea').addEventListener('input',()=>{
  const f=state.frags.get(state.activeId); if(!f) return;
  f.innerHTML=el('htmlArea').value;
  f.dirty=(f.innerHTML!==f.origHTML)||labelChanged(f);
  updatePreview(f);
  reflectDirty(f);
});
el('edLabel').addEventListener('input',()=>{
  const f=state.frags.get(state.activeId); if(!f) return;
  f.label=el('edLabel').value;
  f.dirty=(f.innerHTML!==f.origHTML)||labelChanged(f);
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
    const anyDirty=state.files.get(f.path).fragments.some(id=>state.frags.get(id)?.dirty);
    group.classList.toggle('has-dirty',anyDirty);
  }
  updateUnsavedBar();
}

el('resetBtn').onclick=()=>{
  const f=state.frags.get(state.activeId); if(!f) return;
  f.innerHTML=f.origHTML;
  const m=state.manifest&&state.manifest.find(e=>e.id===f.id);
  f.label=m?m.label:f.id;
  f.dirty=false;
  el('htmlArea').value=f.innerHTML;
  el('edLabel').value=f.label;
  const row=document.querySelector(`.frag-row[data-id="${cssEsc(f.id)}"] .flabel`);
  if(row) row.textContent=f.label;
  updatePreview(f); reflectDirty(f);
  toast('Reset to last loaded version');
};
