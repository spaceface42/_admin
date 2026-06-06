/* ---------- diagnostics ---------- */
let lastDiagnosticsCacheData=null;

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

function shortSha(sha){
  return sha && sha !== 'none' && sha !== 'not loaded' ? `${sha.slice(0,7)}…${sha.slice(-7)}` : sha;
}

function refShaForDiagnostics(ref){
  return ref && ref.object && ref.object.sha ? ref.object.sha : '';
}

async function diagnosticsCacheData(){
  const cachedDefault=LastWriteCommitCache.get(state.defaultBranch) || '';
  const cachedContent=LastWriteCommitCache.get(state.workBranch) || '';
  const loaded=state.contentTree || null;

  const data={
    "Cache status": "not connected",
    "Default branch ref SHA": "not loaded",
    "Content branch ref SHA": "not loaded",
    "Cached default branch SHA": cachedDefault || "none",
    "Cached content branch SHA": cachedContent || "none",
    "Loaded content commit SHA": loaded ? loaded.commitSha : "not loaded",
    "Loaded content source": loaded ? (loaded.source || "unknown") : "not loaded",
    "Loaded content tree SHA": loaded ? loaded.treeSha : "not loaded",
    "Cache validation": "not run",
    "Cache decision": "not loaded"
  };

  if(!state.owner || !state.repo || !state.token){
    data["Cache decision"]="connect to a repository first";
    return data;
  }

  try{
    const [defaultRef,contentRef]=await Promise.all([
      GitHubApi.getRef(state.defaultBranch),
      GitHubApi.getRef(state.workBranch)
    ]);

    const defaultSha=refShaForDiagnostics(defaultRef);
    const contentSha=refShaForDiagnostics(contentRef);

    data["Default branch ref SHA"]=defaultSha || "unavailable";
    data["Content branch ref SHA"]=contentSha || "unavailable";

    if(loaded && loaded.commitSha===contentSha){
      data["Cache status"]="ok — loaded content matches branch ref";
      data["Cache decision"]="branch ref";
    }else if(loaded && cachedContent && loaded.commitSha===cachedContent){
      data["Cache status"]="ok — loaded from validated cached write";
      data["Cache decision"]="cached write";
    }else if(loaded && contentSha && loaded.commitSha!==contentSha){
      data["Cache status"]="warning — loaded content differs from branch ref";
      data["Cache decision"]="loaded SHA does not match current refs/heads/content";
    }else{
      data["Cache status"]="ok — no loaded content mismatch detected";
      data["Cache decision"]="branch ref";
    }

    if(cachedContent && contentSha && cachedContent!==contentSha){
      try{
        const cmp=await GitHubApi.compare(contentSha,cachedContent);
        const ahead=typeof cmp.ahead_by==='number' ? cmp.ahead_by : 'unknown';
        const behind=typeof cmp.behind_by==='number' ? cmp.behind_by : 'unknown';
        data["Cache validation"]=`cached vs branch: ahead ${ahead}, behind ${behind}`;
        if(ahead===0){
          data["Cache status"]="warning — cached content SHA differs but is not ahead";
        }
      }catch(e){
        data["Cache validation"]=`compare failed: ${e.message||e}`;
        data["Cache status"]="warning — cache validation failed";
      }
    }else if(cachedContent && contentSha && cachedContent===contentSha){
      data["Cache validation"]="cached content SHA equals branch ref";
    }else if(!cachedContent){
      data["Cache validation"]="no cached content SHA";
    }

    // Compact helper values make screenshots easier to read while full values
    // remain available above and in Copy diagnostics.
    data["Default branch short SHA"]=shortSha(defaultSha || "none");
    data["Content branch short SHA"]=shortSha(contentSha || "none");
    data["Cached content short SHA"]=shortSha(cachedContent || "none");
    data["Loaded content short SHA"]=shortSha(loaded ? loaded.commitSha : "not loaded");

    return data;
  }catch(e){
    data["Cache status"]="warning — branch ref fetch failed";
    data["Cache validation"]=e.message || String(e);
    data["Cache decision"]="could not verify branch refs";
    return data;
  }
}

function appendDiagnosticsSection(grid,title){
  const heading=document.createElement('div');
  heading.className='diag-section';
  heading.textContent=title;
  grid.appendChild(heading);
}

function appendDiagnosticsRows(grid,data){
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
}

async function renderDiagnostics(){
  const grid=el('diagnosticsGrid');
  grid.innerHTML='';

  try{
    appendDiagnosticsSection(grid,'Runtime');
    appendDiagnosticsRows(grid,diagnosticsData());

    appendDiagnosticsSection(grid,'Cache / content source');
    appendDiagnosticsRows(grid,{"Cache status":"loading…"});
    const cache=await diagnosticsCacheData();
    lastDiagnosticsCacheData=cache;

    grid.innerHTML='';
    appendDiagnosticsSection(grid,'Runtime');
    appendDiagnosticsRows(grid,diagnosticsData());
    appendDiagnosticsSection(grid,'Cache / content source');
    appendDiagnosticsRows(grid,cache);

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

async function diagnosticsText(){
  try{
    const runtime=diagnosticsData();
    const cache=await diagnosticsCacheData();
    lastDiagnosticsCacheData=cache;
    return DiagnosticsUtils.diagnosticsTextSections([
      {title:'Runtime',data:runtime},
      {title:'Cache / content source',data:cache}
    ],allValidationWarnings());
  }catch(e){
    return 'Diagnostics failed: '+(e.message||e);
  }
}

async function copyDiagnostics(){
  const text=await diagnosticsText();
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
