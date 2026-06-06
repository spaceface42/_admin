/* ---------- publish ---------- */
el('publishBtn').onclick=openPublishModal;
el('pubCancel').onclick=()=>el('pubModal').classList.remove('show');
el('pubConfirm').onclick=doPublish;

async function syncWorkBranchFromMain(){
  try{
    await GitHubApi.merge(state.workBranch,state.defaultBranch,'cms: sync '+state.defaultBranch+' → '+state.workBranch);
  }catch(e){
    if(e.status===409) e.phase='sync-main-into-work';
    throw e;
  }
}

async function doPublish(){
  const btn=el('pubConfirm'); btn.disabled=true; btn.textContent='Syncing…';
  el('pubErr').classList.remove('show');
  try{
    await syncWorkBranchFromMain();
    btn.textContent='Publishing…';
    await GitHubApi.merge(state.defaultBranch,state.workBranch,'cms: publish '+state.workBranch+' → '+state.defaultBranch);
    el('pubModal').classList.remove('show');
    toast('Published — GitHub Action will deploy shortly','ok');
    await loadAll();
  }catch(e){
    const err=el('pubErr');
    if(e.status===409){
      const compare=`https://github.com/${state.owner}/${state.repo}/compare/${state.defaultBranch}...${state.workBranch}`;
      if(e.phase==='sync-main-into-work'){
        err.innerHTML=`<b>${esc(state.workBranch)}</b> and <b>${esc(state.defaultBranch)}</b> both changed the same file/lines, so GitCMS could not auto-sync before publishing. `+
          `Resolve it on GitHub: <a href="${compare}" target="_blank" rel="noopener">open the compare view ↗</a>.`;
      }else{
        err.innerHTML=`Merge conflict while publishing <b>${esc(state.workBranch)}</b> → <b>${esc(state.defaultBranch)}</b>. `+
          `Resolve it on GitHub: <a href="${compare}" target="_blank" rel="noopener">open the compare view ↗</a>.`;
      }
    }else if(e.status===403){
      err.textContent='Forbidden (403) — the token lacks merge permission.';
    }else if(e.status===404){
      err.textContent='Nothing to merge, or branch not found.';
    }else{
      err.textContent='Publish failed: '+e.message;
    }
    err.classList.add('show');
  }finally{
    btn.disabled=false; btn.textContent='Publish';
  }
}
