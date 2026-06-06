/* ---------- publish summary ---------- */
let lastPublishCompare=null;

function statusLabel(status){
  if(status==='added') return 'added';
  if(status==='removed') return 'deleted';
  if(status==='renamed') return 'renamed';
  if(status==='modified') return 'modified';
  return status || 'changed';
}

function renderPublishSummary(compare){
  lastPublishCompare=compare;
  const box=el('pubSummary');
  const files=(compare && Array.isArray(compare.files)) ? compare.files : [];
  const ahead=compare && typeof compare.ahead_by==='number' ? compare.ahead_by : null;
  const total=files.length;

  if(!compare){
    box.innerHTML='<div class="publish-empty">Could not load changed files. Publishing may still work.</div>';
    return;
  }

  if(total===0 && ahead===0){
    box.innerHTML=
      `<div class="ps-head"><span class="ps-title">Nothing to publish</span>`+
      `<span class="ps-count">${esc(state.workBranch)} is up to date with ${esc(state.defaultBranch)}</span></div>`+
      `<div class="publish-empty">No file changes found between branches.</div>`;
    return;
  }

  const shown=files.slice(0,40);
  const rows=shown.map(f=>{
    const status=statusLabel(f.status);
    const path=f.status==='renamed' && f.previous_filename
      ? `${f.previous_filename} → ${f.filename}`
      : f.filename;
    return `<li><span class="pf-status ${escAttr(f.status||'changed')}">${esc(status)}</span><span class="pf-path" title="${escAttr(path)}">${esc(path)}</span></li>`;
  }).join('');

  const more=files.length>shown.length
    ? `<li><span class="pf-status">more</span><span class="pf-path">…and ${files.length-shown.length} more files</span></li>`
    : '';

  box.innerHTML=
    `<div class="ps-head"><span class="ps-title">Files to publish</span>`+
    `<span class="ps-count">${total} file${total===1?'':'s'}${ahead!==null ? ` · ${ahead} commit${ahead===1?'':'s'} ahead` : ''}</span></div>`+
    `<ul class="publish-files">${rows || '<li><span class="pf-path">Branch has commits but no file list was returned.</span></li>'}${more}</ul>`;
}

async function loadPublishSummary(){
  const box=el('pubSummary');
  box.innerHTML='<div class="publish-empty">Loading changed files…</div>';

  try{
    const base=encodeURIComponent(state.defaultBranch);
    const head=encodeURIComponent(state.workBranch);
    const compare=await GitHubApi.compare(state.defaultBranch,state.workBranch);
    renderPublishSummary(compare);
  }catch(e){
    lastPublishCompare=null;
    box.innerHTML=
      `<div class="publish-empty">Could not load changed files: ${esc(e.message)}.</div>`;
  }
}

async function openPublishModal(){
  syncActiveFromTextarea();
  const dirty=[...state.frags.values()].filter(f=>f.dirty);
  const warn=el('pubWarn');
  if(dirty.length){
    warn.innerHTML=`<b>${dirty.length}</b> fragment${dirty.length===1?' has':'s have'} unsaved changes that won't be published. Save them to ${esc(state.workBranch)} first.`;
    warn.classList.add('show');
  }else warn.classList.remove('show');

  el('pubErr').classList.remove('show');
  el('pubModal').classList.add('show');
  await loadPublishSummary();
}
