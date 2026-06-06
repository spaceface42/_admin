/* ---------- diagnostics ---------- */
function diagnosticsData(){
  const dirty=[...state.frags.values()].filter(f=>f.dirty);
  const active=state.activeId ? state.frags.get(state.activeId) : null;
  const repoUrl=state.owner && state.repo ? `https://github.com/${state.owner}/${state.repo}` : '';
  const contentUrl=state.owner && state.repo ? repoUrlForBranch() : '';
  const pagesFallback=state.owner && state.repo ? fallbackPagesUrl() : '';

  return {
    "GitCMS version": GITCMS_VERSION,
    "Repository": state.owner && state.repo ? `${state.owner}/${state.repo}` : "not connected",
    "Default branch": state.defaultBranch || "unknown",
    "Content branch": state.workBranch || "unknown",
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

function diagnosticsStatusClass(key,value){
  if(key==="Unsaved fragments" && value!=="0") return "warn";
  if(key==="Validation warnings" && value!=="0") return "warn";
  if(key==="Config loaded" && value==="not found") return "warn";
  if(key==="Manifest loaded" && value==="no") return "warn";
  if(["Repository","Default branch","Content branch","Media folder","Media URL prefix"].includes(key) && value && !/not|unknown/.test(value)) return "ok";
  return "";
}

function renderDiagnostics(){
  const grid=el('diagnosticsGrid');
  const data=diagnosticsData();
  grid.innerHTML='';

  for(const [key,value] of Object.entries(data)){
    const k=document.createElement('div');
    k.className='diag-key';
    k.textContent=key;

    const v=document.createElement('div');
    v.className='diag-val '+diagnosticsStatusClass(key,value);
    v.title=value;
    v.textContent=value;

    grid.appendChild(k);
    grid.appendChild(v);
  }

  el('diagnosticsNote').innerHTML =
    `Expected workflow: <span class="mono">${esc(state.workBranch)}</span> is the CMS editing branch, `+
    `<span class="mono">${esc(state.defaultBranch)}</span> is the live publish branch. `+
    `Media should usually be saved under <span class="mono">${esc(mediaDir())}</span> and inserted as `+
    `<span class="mono">${esc(mediaPrefix())}</span>.`;

  renderValidationBox();

  el('diagnosticsErr').classList.remove('show');
  el('diagnosticsErr').textContent='';
}

function openDiagnostics(){
  renderDiagnostics();
  el('diagnosticsModal').classList.add('show');
}

function diagnosticsText(){
  const data=diagnosticsData();
  const base=Object.entries(data).map(([k,v])=>`${k}: ${v}`).join('\n');
  const warnings=allValidationWarnings();
  if(!warnings.length) return base;
  return base+'\n\nValidation warnings:\n'+warnings.map(w=>`- ${w.kind}: ${w.msg}`).join('\n');
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
