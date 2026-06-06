/* ---------- external links ---------- */
function repoUrlForBranch(){
  if(!state.owner || !state.repo) return '';
  return `https://github.com/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/tree/${encodeURIComponent(state.workBranch)}`;
}

function fallbackPagesUrl(){
  if(!state.owner || !state.repo) return '';
  // User/organization Pages repo: owner.github.io
  if(state.repo.toLowerCase() === `${state.owner.toLowerCase()}.github.io`){
    return `https://${state.owner}.github.io/`;
  }
  // Project Pages repo
  return `https://${state.owner}.github.io/${state.repo}/`;
}

async function liveSiteUrl(){
  // Prefer GitHub Pages API because custom domains and non-standard Pages settings
  // can exist. If it fails, fall back to the standard project Pages URL.
  try{
    const pages=await GitHubApi.getPagesInfo();
    if(pages && pages.html_url) return pages.html_url.replace(/\/?$/,'/');
  }catch(e){
    // 404/403 means Pages endpoint is unavailable or token lacks permission.
  }
  return fallbackPagesUrl();
}

function openContentBranch(){
  const url=repoUrlForBranch();
  if(!url){ toast('Connect to a repo first','err'); return; }
  window.open(url,'_blank','noopener,noreferrer');
}

async function openLiveSite(){
  if(!state.owner || !state.repo){ toast('Connect to a repo first','err'); return; }
  const btn=el('openLiveBtn');
  const old=btn.innerHTML;
  btn.disabled=true;
  btn.textContent='Opening…';
  try{
    window.open(await liveSiteUrl(),'_blank','noopener,noreferrer');
  }catch(e){
    window.open(fallbackPagesUrl(),'_blank','noopener,noreferrer');
  }finally{
    btn.disabled=false;
    btn.innerHTML=old;
  }
}
