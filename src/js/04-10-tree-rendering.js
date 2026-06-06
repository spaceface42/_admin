/* ---------- tree rendering ---------- */

function renderTree(){
  const tree=el('tree'); tree.innerHTML='';
  const byFile=new Map();
  for(const f of state.frags.values()){
    if(!byFile.has(f.path)) byFile.set(f.path,[]);
    byFile.get(f.path).push(f);
  }
  for(const [path,frags] of byFile){
    const group=document.createElement('div');
    group.className='file-group';
    group.dataset.path=path;
    const anyDirty=frags.some(f=>f.dirty);
    if(anyDirty) group.classList.add('has-dirty');

    const row=document.createElement('div');
    row.className='file-row';
    row.innerHTML=`
      <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
      <span>${esc(path)}</span>
      <span class="count">${frags.length}</span>
      <span class="fdot"></span>`;
    row.onclick=()=>group.classList.toggle('collapsed');
    group.appendChild(row);

    const list=document.createElement('div');
    list.className='frag-list';
    for(const f of frags){
      const fr=document.createElement('div');
      fr.className='frag-row'+(f.dirty?' dirty':'')+(f.id===state.activeId?' active':'');
      fr.dataset.id=f.id;
      fr.innerHTML=`
        <span class="ddot"></span>
        <span class="flabel">${esc(f.label)}</span>
        <span class="fid">#${esc(f.id)}</span>`;
      fr.onclick=()=>selectFragment(f.id);
      list.appendChild(fr);
    }
    group.appendChild(list);
    tree.appendChild(group);
  }
}

function showEmpty(){
  el('emptyState').style.display='flex';
  el('editorPane').style.display='none';
  el('sbPath').textContent='';
}
