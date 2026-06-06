/* ---------- misc controls ---------- */


el('diagnosticsBtn').onclick=openDiagnostics;
el('diagnosticsClose').onclick=()=>el('diagnosticsModal').classList.remove('show');
el('diagnosticsRefresh').onclick=renderDiagnostics;
el('diagnosticsCopy').onclick=copyDiagnostics;

el('openContentBtn').onclick=openContentBranch;
el('openLiveBtn').onclick=openLiveSite;

el('refreshBtn').onclick=()=>loadAll();
el('sideRefresh').onclick=()=>loadAll();

el('resetDraftBtn').onclick=async()=>{
  const anyDirty=[...state.frags.values()].some(f=>f.dirty);
  const warn=anyDirty
    ? 'You have unsaved edits that will be discarded. '
    : '';
  if(!confirm(warn+`Reset ${state.workBranch} to match ${state.defaultBranch}? `+
     `Any unpublished commits on ${state.workBranch} will be lost.`)) return;
  const btn=el('resetDraftBtn'); btn.disabled=true; btn.textContent='Resetting…';
  try{
    const ref=await GitHubApi.request(`/repos/${state.owner}/${state.repo}/git/ref/heads/${state.defaultBranch}`);
    const sha=ref.object.sha;
    try{
      await GitHubApi.request(`/repos/${state.owner}/${state.repo}/git/refs/heads/${state.workBranch}`,{
        method:'PATCH', body:{sha,force:true}
      });
    }catch(e){
      if(e.status===404 || e.status===422){
        await GitHubApi.request(`/repos/${state.owner}/${state.repo}/git/refs`,{
          method:'POST', body:{ref:`refs/heads/${state.workBranch}`,sha}
        });
      }else throw e;
    }
    el('divergeBanner').classList.remove('show');
    toast(`${state.workBranch} reset to ${state.defaultBranch}`,'ok');
    await loadAll();
  }catch(e){
    toast('Reset failed: '+e.message,'err');
  }finally{
    btn.disabled=false; btn.textContent=`Reset ${state.workBranch} from ${state.defaultBranch}`;
  }
};
el('disconnectBtn').onclick=()=>{
  localStorage.removeItem(LS_REPO); localStorage.removeItem(LS_TOKEN);
  location.reload();
};
el('connectBtn').onclick=connect;
[el('repoUrl'),el('token')].forEach(i=>i.addEventListener('keydown',e=>{if(e.key==='Enter')connect();}));
el('commitMsg').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();doCommit();}});


el('altCancel').onclick=closeAltDialog;
el('altInsert').onclick=confirmAltInsert;
el('altDecorative').addEventListener('change',()=>{
  const checked=el('altDecorative').checked;
  el('altTextInput').disabled=checked;
  if(checked) el('altTextInput').value='';
  else if(pendingMediaInsert) el('altTextInput').value=altFromFilename(pendingMediaInsert.name);
});
el('altTextInput').addEventListener('keydown',e=>{
  if(e.key==='Enter'){ e.preventDefault(); confirmAltInsert(); }
});


el('deleteMediaCancel').onclick=closeDeleteMediaDialog;
el('deleteMediaConfirm').onclick=confirmDeleteMedia;

// close modals on backdrop click
document.querySelectorAll('.modal-bg').forEach(m=>m.addEventListener('mousedown',e=>{
  if(e.target===m) m.classList.remove('show');
}));

// warn on unload if dirty
window.addEventListener('beforeunload',e=>{
  if(state.activeId) syncActiveFromTextarea();
  if([...state.frags.values()].some(f=>f.dirty)){ e.preventDefault(); e.returnValue=''; }
});
