/* ---------- commit ---------- */
el('saveBtn').onclick=()=>{
  const f=state.frags.get(state.activeId); if(!f) return;
  syncActiveFromTextarea();
  el('commitMsg').value=`cms: update fragment #${f.id}`;
  el('commitErr').classList.remove('show');
  // count siblings in same file that are also dirty
  const fileRec=state.files.get(f.path);
  const dirtyInFile=fileRec.fragments.filter(id=>state.frags.get(id).dirty);
  el('commitDesc').innerHTML = dirtyInFile.length>1
    ? `Saving <b>${dirtyInFile.length}</b> changed fragments in <span class="mono">${esc(f.path)}</span> to <b>${esc(state.workBranch)}</b> in one commit.`
    : `Saving changes to <span class="mono">${esc(f.path)}</span> on the <b>${esc(state.workBranch)}</b> branch.`;
  el('commitModal').classList.add('show');
  el('commitMsg').focus();
};
el('commitCancel').onclick=()=>el('commitModal').classList.remove('show');
el('commitConfirm').onclick=doCommit;

async function doCommit(){
  const f=state.frags.get(state.activeId); if(!f) return;
  const msg=el('commitMsg').value.trim()||`cms: update fragment #${f.id}`;
  const btn=el('commitConfirm'); btn.disabled=true; btn.textContent='Committing…';
  el('commitErr').classList.remove('show');

  const fileRec=state.files.get(f.path);
  try{
    const dirtyIds=fileRec.fragments.filter(id=>state.frags.get(id)?.dirty);
    const htmlDirtyIds=dirtyIds.filter(id=>{
      const frag=state.frags.get(id);
      return frag && frag.innerHTML!==frag.origHTML;
    });

    // Use the live draft file as the base before writing. This keeps the
    // one-person workflow forgiving when another GitCMS action, media upload,
    // config save, or GitHub UI edit moved the work branch after load.
    if(htmlDirtyIds.length){
      let put=null;
      for(let attempt=1; attempt<=2; attempt++){
        try{
          let content=fileRec.content;
          let sha=null;
          try{
            const cur=await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(f.path)}?ref=${encodeURIComponent(state.workBranch)}`);
            content=dec(cur.content);
            sha=cur.sha;
          }catch(e){ if(e.status!==404) throw e; }

          for(const id of htmlDirtyIds){
            const frag=state.frags.get(id);
            content=replaceFragment(content,frag);
          }

          put=await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(f.path)}`,{
            method:'PUT',
            body:{ message:msg, content:enc(content), branch:state.workBranch, ...(sha?{sha}:{}) }
          });

          fileRec.content=content;
          fileRec.shaDraft=put.content.sha;
          break;
        }catch(e){
          if(e.status===409 && attempt<2){
            await sleep(400);
            continue;
          }
          throw e;
        }
      }
    }

    // Manifest update (labels) — only needed when something in this file is dirty.
    // This also handles label-only saves without rewriting the HTML file.
    if(state.manifest && dirtyIds.length){
      await commitManifest(msg);
    }

    for(const id of dirtyIds){
      const frag=state.frags.get(id);
      frag.origHTML=frag.innerHTML;
      frag.dirty=false;
    }

    el('commitModal').classList.remove('show');
    renderTree();
    selectFragment(f.id);
    updateUnsavedBar();
    toast('Committed to '+state.workBranch,'ok');
  }catch(e){
    const err=el('commitErr');
    err.innerHTML = commitErrMsg(e);
    err.classList.add('show');
  }finally{
    btn.disabled=false; btn.textContent='Commit';
  }
}

function commitErrMsg(e){
  if(e.status===409) return `GitHub reported a write conflict. GitCMS retried once using the live ${esc(state.workBranch)} file, but it still failed. Refresh and try again.`;
  if(e.status===422) return 'GitHub rejected the write (422). The branch or path may be invalid.';
  if(e.status===403) return 'Forbidden (403) — the token lacks Contents: write on this repo.';
  return 'Commit failed: '+esc(e.message);
}

/* Replace a single fragment in file content. Throw if it cannot be
   located, so the UI cannot report a successful commit when nothing changed. */
function replaceFragment(content,frag){
  // Preferred replacement: marker boundary. This safely handles nested sections
  // because the editable range is defined by cms:start/cms:end comments.
  if(frag.mode==='marker' || frag.markerId){
    const parts=extractMarkedFragment(content,frag.markerId||frag.id) || extractMarkedFragment(content,frag.id);
    if(!parts){
      throw new Error(`Fragment markers not found in file: ${frag.id}`);
    }
    return content.slice(0,parts.fullStart) +
      rebuildMarkedFragmentFromParts(parts,frag.innerHTML) +
      content.slice(parts.fullEnd);
  }

  // Backward-compatible fallback for old section-based fragments.
  let matched=false;
  const out=content.replace(SECTION_RE,(whole,openTag,attrs,inner)=>{
    if(matched) return whole;
    const id=fragmentIdFromAttrs(attrs);
    if(id===frag.id && attrsDeclareFragment(attrs)){
      matched=true;
      return rebuildFragment(frag);
    }
    return whole;
  });
  if(!matched){
    throw new Error(`Fragment not found in file: ${frag.id}`);
  }
  return out;
}

async function commitManifest(msg){
  // rebuild manifest labels from current fragment state
  const updated=state.manifest.map(e=>{
    const f=state.frags.get(e.id);
    return f?{...e,label:f.label}:e;
  });
  // include any fragments not yet in manifest? keep manifest as-is otherwise.
  let sha=null;
  try{
    const cur=await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(state.manifestPath)}?ref=${encodeURIComponent(state.workBranch)}`);
    sha=cur.sha;
  }catch(e){ if(e.status!==404) throw e; }
  await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(state.manifestPath)}`,{
    method:'PUT',
    body:{message:msg+' (manifest)',content:enc(JSON.stringify(updated,null,2)+'\n'),branch:state.workBranch,...(sha?{sha}:{})}
  });
  state.manifest=updated;
}
