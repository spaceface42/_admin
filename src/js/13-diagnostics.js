/* ---------- diagnostics ---------- */
function diagnosticsData(){
  const dirty=Store.dirtyFragments();
  const active=state.activeId ? state.frags.get(state.activeId) : null;
  const repoUrl=state.owner && state.repo ? `https://github.com/${state.owner}/${state.repo}` : '';
  const contentUrl=state.owner && state.repo ? repoUrlForBranch() : '';
  const pagesFallback=state.owner && state.repo ? fallbackPagesUrl() : '';

  return {
    "GitCMS version": GITCMS_VERSION,
    "Repository": state.owner && state.repo ? `${state.owner}/${state.repo}` : "not connected",
    "Default branch": state.defaultBranch || "unknown",
    "Content branch": state.workBranch || "unknown",
    "CMS source branch": state.workBranch || "unknown",
    "Main fallback": "disabled",
    "Content commit SHA": state.contentTree ? state.contentTree.commitSha : "not loaded",
    "Content tree source": state.contentTree ? (state.contentTree.source || "unknown") : "not loaded",
    "Pinned last write SHA": LastWriteCommitCache.get(state.workBranch) || "none",
    "Content tree SHA": state.contentTree ? state.contentTree.treeSha : "not loaded",
    "File read mode": "Git data API blob read",
    "Manifest path": state.manifestPath || DEFAULT_MANIFEST_PATH,
    "Manifest loaded": state.manifest ? "yes" : "no",
    "Config path": CONFIG_PATH,
    "Config loaded": gitcmsConfigLoaded ? (gitcmsConfig ? "yes" : "not found") : "not loaded",
    "Validation warnings": String(validationCount()),
    "Media folder": mediaDir() || "not set",
    "Media URL prefix": mediaPrefix() || "not set",
    "Preview CSS": previewCssList().length ? previewCssList().join(", ") : "none",
    "Preview mode": state.previewMode,
    "Fragments loaded": String(state.frags.size),
    "Files loaded": String(state.files.size),
    "Unsaved fragments": String(dirty.length),
    "Active fragment": active ? `#${active.id} — ${active.label}` : "none",
    "Active file": active ? active.path : "none",
    "Repository URL": repoUrl || "not connected",
    "Content branch URL": contentUrl || "not connected",
    "Live site URL": pagesFallback || "not connected",
    "Admin origin": location.origin === "null" ? "local file" : location.origin
  };
}


function renderDiagnostics(){
  const grid=el('diagnosticsGrid');
  grid.innerHTML='';

  try{
    const data=diagnosticsData();

    for(const row of DiagnosticsUtils.diagnosticsRows(data)){
      const k=document.createElement('div');
      k.className='diag-key';
      k.textContent=row.key;

      const v=document.createElement('div');
      v.className='diag-val '+row.statusClass;
      v.title=row.value;
      v.textContent=row.value;

      grid.appendChild(k);
      grid.appendChild(v);
    }

    const note=DiagnosticsUtils.diagnosticsWorkflowNote({
      workBranch:state.workBranch,
      defaultBranch:state.defaultBranch,
      mediaDir:mediaDir(),
      mediaPrefix:mediaPrefix()
    });
    el('diagnosticsNote').innerHTML =
      `Expected workflow: <span class="mono">${esc(note.workBranch)}</span> is the CMS editing branch, `+
      `<span class="mono">${esc(note.defaultBranch)}</span> is the live publish branch. `+
      `Media should usually be saved under <span class="mono">${esc(note.mediaDir)}</span> and inserted as `+
      `<span class="mono">${esc(note.mediaPrefix)}</span>.`;

    renderValidationBox();

    el('diagnosticsErr').classList.remove('show');
    el('diagnosticsErr').textContent='';
  }catch(e){
    console.error('Diagnostics failed',e);
    grid.innerHTML='';
    el('diagnosticsErr').textContent='Diagnostics failed: '+(e.message||e);
    el('diagnosticsErr').classList.add('show');
  }
}

function openDiagnostics(){
  el('diagnosticsModal').classList.add('show');
  renderDiagnostics();
}

function diagnosticsText(){
  try{
    return DiagnosticsUtils.diagnosticsText(diagnosticsData(),allValidationWarnings());
  }catch(e){
    return 'Diagnostics failed: '+(e.message||e);
  }
}

async function copyDiagnostics(){
  const text=diagnosticsText();
  try{
    await navigator.clipboard.writeText(text);
    toast('Diagnostics copied','ok');
  }catch(e){
    // Clipboard can fail from file://. Fallback to a temporary textarea.
    const ta=document.createElement('textarea');
    ta.value=text;
    ta.style.position='fixed';
    ta.style.left='-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try{
      document.execCommand('copy');
      toast('Diagnostics copied','ok');
    }catch(err){
      const box=el('diagnosticsErr');
      box.textContent='Copy failed. Select and copy manually from the browser console if needed.';
      box.classList.add('show');
    }finally{
      ta.remove();
    }
  }
}
