/* ---------- save manifest (when none existed) ---------- */
el('saveManifestBtn').onclick=async()=>{
  const man=[...state.frags.values()].map(f=>({id:f.id,file:f.path,label:f.label}));
  try{
    let sha=null;
    try{
      const cur=await GitHubApi.request(`/repos/${state.owner}/${state.repo}/contents/${ghPath(state.manifestPath)}?ref=${encodeURIComponent(state.workBranch)}`);
      sha=cur.sha;
    }catch(e){ if(e.status!==404) throw e; }

    await GitHubApi.request(`/repos/${state.owner}/${state.repo}/contents/${ghPath(state.manifestPath)}`,{
      method:'PUT',
      body:{
        message:'cms: save '+state.manifestPath,
        content:enc(JSON.stringify(man,null,2)+'\n'),
        branch:state.workBranch,
        ...(sha?{sha}:{})
      }
    });
    state.manifest=man;
    el('banner').classList.remove('show');
    toast('Manifest saved to '+state.workBranch,'ok');
  }catch(e){ toast('Manifest save failed: '+e.message,'err'); }
};
