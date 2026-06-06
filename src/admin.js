/*
  GitCMS Admin JS
  Source file for development.

  Refactor pass 1:
  - extracted from single-file admin.html
  - behavior intentionally unchanged
  - future cleanup should organize this file into modules:
    config, githubApi, branches, fragments, validation, media,
    preview, editor, publishing, diagnostics, ui
*/

"use strict";
/* ============================================================
   GitCMS — single-file, zero-backend CMS
   Data model: ONE canonical file per path. Fragments reference
   their file, they do not carry their own copy of file content.
   ============================================================ */

const LS_REPO='gitcms_repo', LS_TOKEN='gitcms_tok';
// TODO SECURITY:
// During development, the GitHub token is stored in localStorage for convenience.
// Before production/public use, replace this with sessionStorage, OAuth/device flow,
// or another safer auth model. Base64 is obfuscation only, not encryption.
const API='https://api.github.com';
const GITCMS_VERSION='1.1.0';
const CONFIG_PATH='gitcms.config.json';
const DEFAULT_MEDIA_DIR='assets/media';
const DEFAULT_MANIFEST_PATH='fragments.json';
const DEFAULT_WORK_BRANCH='content';
const LEGACY_WORK_BRANCH='draft';

const state = {
  owner:'', repo:'', token:'',
  defaultBranch:'main',   // read source of truth (resolved at connect)
  workBranch:'content',
  files:   new Map(),     // path -> { path, content, shaMain, shaDraft, fragments:[ids] }
  frags:   new Map(),     // id   -> fragment object (references file via .path)
  manifest:null,          // array | null  (null => none found)
  manifestPath:'fragments.json',
  activeId:null,
  previewMode:'fragment',
  validation:{config:[],manifest:[],markers:[],runtime:[]},
};

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const el=(id)=>document.getElementById(id);
const enc=s=>btoa(unescape(encodeURIComponent(s)));
const dec=s=>decodeURIComponent(escape(atob(s)));
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function toast(msg,kind){
  const t=el('toast'); el('toastTxt').textContent=msg;
  t.className=''; if(kind)t.classList.add(kind); t.classList.add('show');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2600);
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function gh(path,{method='GET',body,raw=false}={}){
  const res=await fetch(API+path,{
    method,
    headers:{
      'Authorization':'Bearer '+state.token,
      'Accept':'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
      ...(body?{'Content-Type':'application/json'}:{})
    },
    body:body?JSON.stringify(body):undefined
  });
  if(!res.ok){
    let detail=''; try{detail=(await res.json()).message||'';}catch(e){}
    const err=new Error(detail||res.statusText); err.status=res.status; throw err;
  }
  if(raw) return res;
  if(res.status===204) return null;
  const text=await res.text();
  return text ? JSON.parse(text) : null;
}

function parseRepoUrl(url){
  const m=url.trim().replace(/\.git$/,'').match(/github\.com[/:]([^/]+)\/([^/]+)/);
  if(!m) return null;
  return {owner:m[1],repo:m[2]};
}


function ghPath(path){
  return path.split('/').map(encodeURIComponent).join('/');
}
function normalizeRepoPath(path){
  return (path||'').trim().replace(/^\/+|\/+$/g,'').replace(/\/+/g,'/');
}
function defaultPublicPrefixFor(dir){
  const clean=normalizeRepoPath(dir).replace(/^docs\//,'');
  // GitHub Pages project sites usually live under /<repo>/.
  // Therefore a leading slash like /assets/media/ points to the domain root,
  // not the project root. Default to a relative prefix: assets/media/
  return clean.replace(/\/?$/,'/');
}
function normalizePublicPrefix(prefix,dir){
  let raw=(prefix||'').trim()||defaultPublicPrefixFor(dir);
  if(raw.includes('{path}') || raw.includes('{file}')) return raw;
  // Preserve exactly what the user chose: relative, root-relative, parent-relative,
  // or absolute URL. Only ensure a trailing slash for simple folder prefixes.
  return raw.replace(/\/?$/,'/');
}
function mediaDir(){
  const m=configMedia();
  return normalizeRepoPath((m && m.dir) || DEFAULT_MEDIA_DIR);
}
function mediaPrefix(){
  const m=configMedia();
  const raw=(m && m.publicPrefix) || '';
  return normalizePublicPrefix(raw,mediaDir());
}

function previewCssList(){
  const p=gitcmsConfig && gitcmsConfig.preview;
  if(!p || typeof p!=='object') return [];
  const css=Array.isArray(p.css) ? p.css : (typeof p.css==='string' ? [p.css] : []);
  return css.map(x=>String(x).trim()).filter(Boolean);
}
function publicPathToRepoPath(publicPath){
  const clean=normalizeRepoPath(publicPath);
  if(!clean) return '';
  // In this GitHub Pages setup, public paths are relative to docs/.
  // If the config later needs non-docs publishing, this can become configurable.
  if(clean.startsWith('docs/')) return clean;
  return 'docs/' + clean;
}
function rawUrlForRepoPath(path){
  const encoded=normalizeRepoPath(path).split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${state.owner}/${state.repo}/${encodeURIComponent(state.workBranch)}/${encoded}`;
}
function previewCssTags(){
  if(!state.owner || !state.repo) return '';
  return previewCssList().map(path=>{
    const repoPath=publicPathToRepoPath(path);
    const href=rawUrlForRepoPath(repoPath) + '?v=' + Date.now();
    return `<link rel="stylesheet" href="${escAttr(href)}">`;
  }).join('\n');
}

function mediaPublicUrl(path){
  const prefix=mediaPrefix();
  const file=path.split('/').pop();
  if(prefix.includes('{path}')) return prefix.replace('{path}', path);
  if(prefix.includes('{file}')) return prefix.replace('{file}', file);
  return prefix.replace(/\/?$/,'/') + file;
}
function mimeFromName(name){
  const n=name.toLowerCase();
  if(n.endsWith('.svg')) return 'image/svg+xml';
  if(n.endsWith('.png')) return 'image/png';
  if(n.endsWith('.webp')) return 'image/webp';
  if(n.endsWith('.gif')) return 'image/gif';
  if(n.endsWith('.avif')) return 'image/avif';
  return 'image/jpeg';
}
function escAttr(s){
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}


/* ---------- validation ---------- */
function validationCount(){
  const v=state.validation||{};
  return ['config','manifest','markers','runtime'].reduce((sum,k)=>sum+((v[k]||[]).length),0);
}
function resetLoadValidation(){
  state.validation.manifest=[];
  state.validation.markers=[];
  state.validation.runtime=[];
}
function addValidation(kind,msg){
  if(!state.validation[kind]) state.validation[kind]=[];
  if(!state.validation[kind].includes(msg)) state.validation[kind].push(msg);
}
function allValidationWarnings(){
  const v=state.validation||{};
  const out=[];
  for(const [kind,items] of Object.entries(v)){
    for(const msg of items||[]) out.push({kind,msg});
  }
  return out;
}
function validateGitCMSConfig(cfg,source='config'){
  const warnings=[];
  const add=m=>warnings.push(`${source}: ${m}`);

  if(!cfg || typeof cfg!=='object' || Array.isArray(cfg)){
    add('gitcms.config.json was not found or is not a JSON object.');
    return warnings;
  }

  if(typeof cfg.workBranch!=='string' || !cfg.workBranch.trim()){
    add('missing "workBranch". Recommended value: "content".');
  }
  if(typeof cfg.manifestPath!=='string' || !cfg.manifestPath.trim()){
    add('missing "manifestPath". Recommended value: "fragments.json".');
  }

  if(!cfg.media || typeof cfg.media!=='object' || Array.isArray(cfg.media)){
    add('missing "media" object.');
  }else{
    if(typeof cfg.media.dir!=='string' || !cfg.media.dir.trim()){
      add('missing "media.dir". Recommended for docs publishing: "docs/assets/media".');
    }
    if(typeof cfg.media.publicPrefix!=='string' || !cfg.media.publicPrefix.trim()){
      add('missing "media.publicPrefix". Recommended for GitHub Pages project sites: "assets/media/".');
    }else{
      const prefix=cfg.media.publicPrefix.trim();
      const isProjectSite=state.owner && state.repo && state.repo.toLowerCase()!==`${state.owner.toLowerCase()}.github.io`;
      if(prefix.startsWith('/') && isProjectSite){
        add(`media.publicPrefix starts with "/". For GitHub Pages project sites, use a relative prefix like "assets/media/".`);
      }
    }
  }

  if(cfg.preview!==undefined){
    if(!cfg.preview || typeof cfg.preview!=='object' || Array.isArray(cfg.preview)){
      add('"preview" must be an object if provided.');
    }else if(cfg.preview.css!==undefined){
      const css=Array.isArray(cfg.preview.css) ? cfg.preview.css : (typeof cfg.preview.css==='string' ? [cfg.preview.css] : null);
      if(!css){
        add('"preview.css" must be a string or an array of strings.');
      }else{
        css.forEach((p,i)=>{
          if(typeof p!=='string' || !p.trim()) add(`preview.css entry ${i+1} must be a non-empty string.`);
          if(typeof p==='string' && p.trim().startsWith('/')){
            add(`preview.css entry "${p}" starts with "/". For GitHub Pages project sites, use relative paths like "assets/style.css".`);
          }
        });
      }
    }
  }

  return warnings;
}
function validateManifestEntries(manifest,source='manifest'){
  const warnings=[];
  const add=m=>warnings.push(`${source}: ${m}`);

  if(!Array.isArray(manifest)){
    add('fragments manifest must be a JSON array.');
    return warnings;
  }

  const seen=new Set();
  manifest.forEach((entry,i)=>{
    if(!entry || typeof entry!=='object' || Array.isArray(entry)){
      add(`entry ${i+1} must be an object.`);
      return;
    }

    const id=String(entry.id||'').trim();
    const file=String(entry.file||'').trim();
    const label=String(entry.label||'').trim();

    if(!id) add(`entry ${i+1} is missing "id".`);
    if(!file) add(`entry ${i+1} (${id||'no id'}) is missing "file".`);
    if(!label) add(`entry ${i+1} (${id||'no id'}) is missing "label".`);
    if(id && seen.has(id)) add(`duplicate fragment id "${id}".`);
    if(id) seen.add(id);
    if(file.startsWith('/')) add(`fragment "${id}" uses an absolute file path "${file}". Use repo-relative paths like "docs/index.html".`);
  });

  return warnings;
}
function validateManifestMatchesLoaded(manifest,source='manifest'){
  if(!Array.isArray(manifest)) return;
  for(const entry of manifest){
    if(!entry || !entry.id || !entry.file) continue;
    const f=state.frags.get(entry.id);
    if(!f){
      addValidation('manifest', `${source}: fragment "${entry.id}" is listed for "${entry.file}" but was not found in loaded HTML.`);
    }else if(f.path!==entry.file){
      addValidation('manifest', `${source}: fragment "${entry.id}" loaded from "${f.path}", but manifest says "${entry.file}".`);
    }
  }
}
function validateMarkersInFile(fileRec){
  const content=fileRec.content||'';
  const startRe=cmsStartRe();
  const seen=new Set();
  let sm;

  while((sm=startRe.exec(content))){
    const markerId=sm[1];
    if(seen.has(markerId)){
      addValidation('markers', `${fileRec.path}: duplicate cms marker id "${markerId}".`);
    }
    seen.add(markerId);

    const afterStart=startRe.lastIndex;
    const rest=content.slice(afterStart);
    const endRe=markerEndRegex(markerId);
    const em=endRe.exec(rest);

    if(!em){
      addValidation('markers', `${fileRec.path}: cms:start "${markerId}" has no matching cms:end "${markerId}".`);
      continue;
    }

    const block=content.slice(afterStart,afterStart+em.index);
    const first=findFirstElement(block);
    if(!first){
      addValidation('markers', `${fileRec.path}: marker "${markerId}" contains no valid HTML element.`);
      startRe.lastIndex=afterStart+em.index+em[0].length;
      continue;
    }

    const close=findMatchingClose(block,first.tag,first.openEnd+1);
    if(!close){
      addValidation('markers', `${fileRec.path}: marker "${markerId}" has an unclosed <${first.tag}> element.`);
      startRe.lastIndex=afterStart+em.index+em[0].length;
      continue;
    }

    const dataId=attrGet(first.attrs,'data-fragment');
    if(dataId && dataId!==markerId){
      addValidation('markers', `${fileRec.path}: cms marker "${markerId}" does not match data-fragment="${dataId}".`);
    }
    if(!dataId){
      addValidation('markers', `${fileRec.path}: marker "${markerId}" should include data-fragment="${markerId}".`);
    }
    if(!attrGet(first.attrs,'data-label')){
      addValidation('markers', `${fileRec.path}: marker "${markerId}" should include data-label for a clearer sidebar label.`);
    }

    startRe.lastIndex=afterStart+em.index+em[0].length;
  }
}
function renderValidationBox(){
  const box=el('validationBox');
  if(!box) return;
  const warnings=allValidationWarnings();

  if(!warnings.length){
    box.classList.remove('show');
    box.innerHTML='';
    return;
  }

  const rows=warnings.slice(0,20).map(w=>`<li><span class="mono">${esc(w.kind)}</span>: ${esc(w.msg)}</li>`).join('');
  const more=warnings.length>20 ? `<li>…and ${warnings.length-20} more warning${warnings.length-20===1?'':'s'}</li>` : '';
  box.innerHTML=`<b>${warnings.length} validation warning${warnings.length===1?'':'s'}</b><ul>${rows}${more}</ul>`;
  box.classList.add('show');
}

/* ---------- fragment parsing ---------- */
/*
  Preferred fragment format:

    <!-- cms:start hero -->
    <section data-fragment="hero" data-label="Hero Section" class="hero">
      ...
    </section>
    <!-- cms:end hero -->

  The comments define the safe replacement boundary.
  data-fragment/data-label describe the editable fragment.
  Backward compatibility remains for:
    <section id="hero" class="fragment">...</section>
    <section data-fragment="hero">...</section>

  Parser note:
  Use local RegExp instances for marker scanning. Do not reuse one global
  CMS_START_RE across nested parser calls, because a malformed marker can reset
  lastIndex and make the loader appear stuck on "Loading...".
*/
const SECTION_RE=/(<section\s([^>]*)>)([\s\S]*?)<\/section>/gi;

function reEsc(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function cmsStartRe(){return /<!--\s*cms:start\s+([A-Za-z0-9_.:-]+)\s*-->/gi;}

function classHasFragment(attrs){
  const m=attrs.match(/class\s*=\s*["']([^"']*)["']/i);
  return m ? /\bfragment\b/.test(m[1]) : false;
}
function attrGet(attrs,name){
  const m=attrs.match(new RegExp(name+'\\s*=\\s*["\']([^"\']*)["\']','i'));
  return m?m[1]:'';
}
function attrsDeclareFragment(attrs){
  return !!attrGet(attrs,'data-fragment') || classHasFragment(attrs);
}
function fragmentIdFromAttrs(attrs,fallback=''){
  return attrGet(attrs,'data-fragment') || attrGet(attrs,'id') || fallback;
}
function fragmentLabelFor(id,attrs){
  const manEntry = state.manifest && state.manifest.find(e=>e.id===id);
  return manEntry ? manEntry.label : (attrGet(attrs,'data-label') || id);
}
function findTagEnd(src,start){
  let quote=null;
  for(let i=start;i<src.length;i++){
    const ch=src[i];
    if(quote){
      if(ch===quote) quote=null;
    }else if(ch==='"' || ch==="'"){
      quote=ch;
    }else if(ch==='>'){
      return i;
    }
  }
  return -1;
}
function findFirstElement(block){
  const re=/<([A-Za-z][A-Za-z0-9:-]*)(?=[\s>/])/g;
  let m;
  while((m=re.exec(block))){
    const openStart=m.index;
    const openEnd=findTagEnd(block,openStart);
    if(openEnd<0) continue;
    const tag=m[1];
    const openTag=block.slice(openStart,openEnd+1);
    const attrs=block.slice(openStart+1+tag.length,openEnd);
    return {tag,openStart,openEnd,openTag,attrs};
  }
  return null;
}
function findMatchingClose(block,tagName,from){
  const re=new RegExp(`<\\/?${reEsc(tagName)}(?=[\\s>/])`,'gi');
  re.lastIndex=from;
  let depth=1,m;
  while((m=re.exec(block))){
    const idx=m.index;
    const isClose=block[idx+1]==='/';
    const tagEnd=findTagEnd(block,idx);
    if(tagEnd<0) return null;

    if(isClose){
      depth--;
      if(depth===0){
        return {
          closeStart:idx,
          closeEnd:tagEnd+1,
          closeTag:block.slice(idx,tagEnd+1)
        };
      }
    }else{
      const open=block.slice(idx,tagEnd+1);
      if(!/\/\s*>$/.test(open)) depth++;
    }
    re.lastIndex=tagEnd+1;
  }
  return null;
}
function markerEndRegex(id){
  return new RegExp(`<!--\\s*cms:end\\s+${reEsc(id)}\\s*-->`,'i');
}
function findMarkedFragments(content,wantedId=null){
  const out=[];
  const startRe=cmsStartRe();
  let sm;

  while((sm=startRe.exec(content))){
    const markerId=sm[1];

    // If searching for one id, skip other markers. Since startRe is local,
    // skipping still advances safely.
    if(wantedId && markerId!==wantedId) continue;

    const afterStart=startRe.lastIndex;
    const endRe=markerEndRegex(markerId);
    const rest=content.slice(afterStart);
    const em=endRe.exec(rest);

    // Malformed marker: no matching end marker. Skip it, but never reset
    // the scan position. This prevents infinite "Loading..." hangs.
    if(!em) continue;

    const blockStart=afterStart;
    const blockEnd=afterStart+em.index;
    const fullStart=sm.index;
    const fullEnd=blockEnd+em[0].length;
    const markerStart=content.slice(fullStart,blockStart);
    const markerEnd=content.slice(blockEnd,fullEnd);
    const block=content.slice(blockStart,blockEnd);

    const first=findFirstElement(block);
    if(!first){
      startRe.lastIndex=fullEnd;
      continue;
    }

    const close=findMatchingClose(block,first.tag,first.openEnd+1);
    if(!close){
      startRe.lastIndex=fullEnd;
      continue;
    }

    const attrs=first.attrs;
    const id=fragmentIdFromAttrs(attrs,markerId);
    if(!id){
      startRe.lastIndex=fullEnd;
      continue;
    }
    if(wantedId && id!==wantedId && markerId!==wantedId){
      startRe.lastIndex=fullEnd;
      continue;
    }

    out.push({
      mode:'marker',
      markerId,
      id,
      tag:first.tag,
      attrs,
      openTag:first.openTag,
      closeTag:close.closeTag,
      innerHTML:block.slice(first.openEnd+1,close.closeStart),
      blockPrefix:block.slice(0,first.openStart),
      blockSuffix:block.slice(close.closeEnd),
      markerStart,
      markerEnd,
      fullStart,
      fullEnd
    });

    startRe.lastIndex=fullEnd;
    if(wantedId) break;
  }

  return out;
}
function extractMarkedFragment(content,wantedId=null){
  return findMarkedFragments(content,wantedId)[0] || null;
}
function rebuildFragment(f){
  return `${f.openTag}${f.innerHTML}${f.closeTag||'</section>'}`;
}
function rebuildMarkedFragmentFromParts(parts,innerHTML){
  return parts.markerStart + parts.blockPrefix + parts.openTag + innerHTML + parts.closeTag + parts.blockSuffix + parts.markerEnd;
}

/* Parse a file's content into fragment objects, registering them on
   the canonical file record. Marker fragments are preferred; old section
   fragments remain supported as fallback. */
function parseFileFragments(fileRec){
  validateMarkersInFile(fileRec);
  const ids=[];
  const seen=new Set();

  // Preferred parser: explicit cms:start/cms:end boundaries.
  for(const frag of findMarkedFragments(fileRec.content)){
    const id=frag.id;
    if(seen.has(id)) continue;
    seen.add(id);

    const f={
      id,
      markerId:frag.markerId,
      mode:'marker',
      classes:attrGet(frag.attrs,'class'),
      label:fragmentLabelFor(id,frag.attrs),
      path:fileRec.path,
      file:fileRec.path.split('/').pop(),
      openTag:frag.openTag,
      closeTag:frag.closeTag,
      innerHTML:frag.innerHTML,
      origHTML:frag.innerHTML,
      dirty:false,
    };
    state.frags.set(id,f);
    ids.push(id);
  }

  // Backward-compatible parser: <section class="fragment"> or data-fragment.
  SECTION_RE.lastIndex=0;
  let m;
  while((m=SECTION_RE.exec(fileRec.content))){
    const openTag=m[1];
    const attrs=m[2];
    if(!attrsDeclareFragment(attrs)) continue;

    const id=fragmentIdFromAttrs(attrs);
    if(!id || seen.has(id)) continue;
    seen.add(id);

    const inner=m[3];
    const f={
      id,
      markerId:null,
      mode:'section',
      classes:attrGet(attrs,'class'),
      label:fragmentLabelFor(id,attrs),
      path:fileRec.path,
      file:fileRec.path.split('/').pop(),
      openTag,
      closeTag:'</section>',
      innerHTML:inner,
      origHTML:inner,
      dirty:false,
    };
    state.frags.set(id,f);
    ids.push(id);
  }

  fileRec.fragments=ids;
  return ids;
}

/* ---------- connect / load ---------- */
async function connect(){
  const url=el('repoUrl').value, tok=el('token').value.trim();
  const parsed=parseRepoUrl(url);
  el('loginErr').style.display='none';
  if(!parsed){ showLoginErr('Could not parse a github.com owner/repo from that URL.'); return; }
  if(!tok){ showLoginErr('A token is required.'); return; }

  state.owner=parsed.owner; state.repo=parsed.repo; state.token=tok;
  const btn=el('connectBtn'); btn.disabled=true; btn.textContent='Connecting…';

  try{
    // resolve default branch
    const repoInfo=await gh(`/repos/${state.owner}/${state.repo}`);
    state.defaultBranch=repoInfo.default_branch||'main';

    // Load config from main FIRST so we know workBranch and manifestPath before
    // ensureWorkBranch() or any branch operations.
    const cfg=await loadGitCMSConfig(true,[state.defaultBranch]);
    applyConfig(cfg);

    // ensure content/work branch exists
    await ensureWorkBranch();

    // Reload config from the work branch first. This preserves unpublished
    // Settings changes after a page refresh/reconnect, while still falling
    // back to the default branch when the work branch has no config yet.
    const branchCfg=await loadGitCMSConfig(true,[state.workBranch,state.defaultBranch]);
    applyConfig(branchCfg);

    // persist creds
    localStorage.setItem(LS_REPO,url.trim());
    localStorage.setItem(LS_TOKEN,enc(tok));

    el('login').style.display='none';
    el('app').style.display='flex';
    el('repoBadgeTxt').textContent=`${state.owner}/${state.repo}`;
    updateBranchLabels();

    await loadAll();
  }catch(e){
    showLoginErr(loginErrMsg(e));
  }finally{
    btn.disabled=false; btn.textContent='Connect';
  }
}

/* Apply workBranch and manifestPath from loaded config into state. */
function applyConfig(cfg){
  if(!cfg) return;
  if(typeof cfg.workBranch==='string' && cfg.workBranch.trim())
    state.workBranch=cfg.workBranch.trim();
  if(typeof cfg.manifestPath==='string' && cfg.manifestPath.trim())
    state.manifestPath=normalizeRepoPath(cfg.manifestPath)||DEFAULT_MANIFEST_PATH;
}

/* Update all branch-name labels in the UI after connect or config save. */
function branchLabel(name){
  return String(name||'').replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}
function updateBranchLabels(){
  el('workBranchBadge').textContent=state.workBranch;
  el('publishTargetTxt').textContent=state.defaultBranch;
  const saveBtn=el('saveBtn');
  if(saveBtn) saveBtn.textContent=`Save → ${branchLabel(state.workBranch)}`;
  const resetBtn=el('resetDraftBtn');
  if(resetBtn) resetBtn.textContent=`Reset ${state.workBranch} from ${state.defaultBranch}`;
  const commitTitle=document.querySelector('#commitModal h3');
  if(commitTitle) commitTitle.textContent=`Commit to ${state.workBranch}`;
  const settingsNote=el('settingsWorkBranchNote');
  if(settingsNote) settingsNote.textContent=state.workBranch;
  const cfgBranch=el('cfgWorkBranch');
  if(cfgBranch) cfgBranch.textContent=state.workBranch;
  const mediaNote=el('mediaBranchNote');
  if(mediaNote) mediaNote.textContent=state.workBranch;
  const pubTitle=document.querySelector('#pubModal h3');
  if(pubTitle) pubTitle.textContent=`Publish to ${state.defaultBranch}`;
  const pubDesc=document.querySelector('#pubModal .mdesc');
  if(pubDesc){
    pubDesc.innerHTML=`Sync <b>${esc(state.defaultBranch)}</b> → <b>${esc(state.workBranch)}</b>, then merge <b>${esc(state.workBranch)}</b> → <b>${esc(state.defaultBranch)}</b>. The GitHub Action will deploy <span class="mono">docs/</span> to Pages.`;
  }
}

function loginErrMsg(e){
  if(e.status===401) return 'Authentication failed — check the token.';
  if(e.status===404) return 'Repo not found, or the token lacks access to it.';
  return 'Connection failed: '+e.message;
}
function showLoginErr(m){ const x=el('loginErr'); x.textContent=m; x.style.display='block'; }

async function ensureWorkBranch(){
  try{
    await gh(`/repos/${state.owner}/${state.repo}/branches/${encodeURIComponent(state.workBranch)}`);
    return;
  }catch(e){
    if(e.status!==404) throw e;
  }

  // If this repo already used the old "draft" branch, seed the new content
  // branch from it so unpublished CMS work is not lost during the rename.
  let sourceBranch=state.defaultBranch;
  if(state.workBranch!==LEGACY_WORK_BRANCH){
    try{
      await gh(`/repos/${state.owner}/${state.repo}/branches/${encodeURIComponent(LEGACY_WORK_BRANCH)}`);
      sourceBranch=LEGACY_WORK_BRANCH;
    }catch(e){
      if(e.status!==404) throw e;
    }
  }

  const ref=await gh(`/repos/${state.owner}/${state.repo}/git/ref/heads/${encodeURIComponent(sourceBranch)}`);
  await gh(`/repos/${state.owner}/${state.repo}/git/refs`,{
    method:'POST',
    body:{ref:`refs/heads/${state.workBranch}`,sha:ref.object.sha}
  });
  toast(`Created ${state.workBranch} branch from ${sourceBranch}`,'ok');
}

/* FIX #2 + hardening: read the manifest from BOTH branches.
   Returns the work-branch manifest if present, with default-branch fallback. */
async function loadManifest(){
  async function read(ref){
    try{
      const r=await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(state.manifestPath)}?ref=${encodeURIComponent(ref)}`);
      let parsed=null;
      try{
        parsed=JSON.parse(dec(r.content));
      }catch(parseErr){
        addValidation('manifest', `${state.manifestPath} on ${ref}: invalid JSON — ${parseErr.message}`);
        return null;
      }
      state.validation.manifest.push(...validateManifestEntries(parsed,`${state.manifestPath} on ${ref}`));
      return Array.isArray(parsed) ? parsed : null;
    }catch(e){ if(e.status===404) return null; throw e; }
  }
  const workMan=await read(state.workBranch);
  const defaultMan =await read(state.defaultBranch);
  return {workMan,defaultMan};
}

async function fetchFile(path){
  // CMS source of truth: read the content/work branch first.
  // The default branch is only a fallback for initial/missing files.
  async function read(ref){
    try{
      const r=await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(path)}?ref=${encodeURIComponent(ref)}`);
      return {content:dec(r.content),sha:r.sha,ref};
    }catch(e){ if(e.status===404) return null; throw e; }
  }

  const work=await read(state.workBranch);
  if(work){
    return {path, content:work.content, src:state.workBranch, shaMain:null, shaDraft:work.sha, fragments:[]};
  }

  const main=await read(state.defaultBranch);
  if(main){
    return {path, content:main.content, src:state.defaultBranch, shaMain:main.sha, shaDraft:null, fragments:[]};
  }

  return null;
}

async function loadAll(){
  resetLoadValidation();
  setStatus('Loading…',true);
  state.files.clear(); state.frags.clear(); state.activeId=null;
  el('banner').classList.remove('show');
  el('divergeBanner').classList.remove('show');

  try{
    const {workMan,defaultMan}=await loadManifest();

    // Build a list of (manifest, sourceLabel) attempts in priority order.
    // Work branch first, then default branch as fallback if draft yields nothing.
    const attempts=[];
    if(workMan) attempts.push({manifest:workMan,from:state.workBranch});
    if(defaultMan)  attempts.push({manifest:defaultMan, from:state.defaultBranch});

    let used=null, diverged=false;

    for(const attempt of attempts){
      const result=await tryLoadFromManifest(attempt.manifest);
      if(result.count>0){
        used=attempt;
        // If we fell through to main because work branch produced nothing, flag divergence.
        if(attempt.from===state.defaultBranch && workMan) diverged=true;
        break;
      }
      // this attempt produced 0 — clear and try next
      state.files.clear(); state.frags.clear();
    }

    if(!used){
      // No manifest worked (or none existed) → full tree scan from work branch.
      await tryTreeScan();
      if(state.frags.size===0 && (workMan||defaultMan)){
        // Manifest(s) existed but matched nothing anywhere.
        setStatus('Manifest matched no fragments',false);
        toast('Manifest found, but no matching fragments in any file','err');
      }else if(!workMan && !defaultMan){
        el('banner').classList.add('show'); // genuine no-manifest case
      }
      state.manifest = defaultMan || workMan || buildManifestFromState();
    }else{
      state.manifest = used.manifest;
      if(diverged){
        el('divergeMsg').innerHTML =
          `Your <b>${esc(state.workBranch)}</b> branch has diverged from <b>${esc(state.defaultBranch)}</b> and its manifest matched no fragments — loaded from <b>${esc(state.defaultBranch)}</b> instead. `+
          `Edits will still save to ${esc(state.workBranch)}. If ${esc(state.workBranch)} is stale, reset it.`;
        el('divergeBanner').classList.add('show');
      }
      // Re-apply labels from the chosen manifest now that frags exist.
      relabelFromManifest(state.manifest);
    }

    validateManifestMatchesLoaded(state.manifest, state.manifestPath);

    // drop files with no fragments
    for(const [p,r] of [...state.files]) if(!r.fragments.length) state.files.delete(p);

    renderTree();
    const n=state.frags.size;
    const warnCount=validationCount();
    setStatus(`${n} fragment${n===1?'':'s'} loaded${warnCount?` · ${warnCount} warning${warnCount===1?'':'s'}`:''}`,false);
    el('sbCount').textContent=`${n} fragment${n===1?'':'s'}${warnCount?` · ${warnCount} warning${warnCount===1?'':'s'}`:''}`;
    if(warnCount) toast(`${warnCount} validation warning${warnCount===1?'':'s'} — open Diagnostics`,'err');
    showEmpty();
  }catch(e){
    setStatus('Load failed',false);
    toast('Load failed: '+e.message,'err');
    console.error(e);
  }
}

/* Load files referenced by a manifest; returns {count}. Does NOT clear state. */
async function tryLoadFromManifest(manifest){
  state.manifest=manifest; // so parseFileFragments can read labels
  const paths=[...new Set(manifest.map(e=>e.file))];
  const recs=await Promise.all(paths.map(p=>fetchFile(p).catch(e=>{
    console.warn('fetch skip',p,e); return null;
  })));
  for(const r of recs){
    if(!r) continue;
    state.files.set(r.path,r);
    parseFileFragments(r);
  }
  // Only count fragments whose id appears in this manifest — guards against a
  // stale manifest that points at the right files but wrong ids.
  const manIds=new Set(manifest.map(e=>e.id));
  let count=0;
  for(const f of state.frags.values()) if(manIds.has(f.id)) count++;
  return {count};
}

async function tryTreeScan(){
  state.manifest=null;

  async function scanBranch(ref){
    const tree=await gh(`/repos/${state.owner}/${state.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    return tree.tree.filter(n=>n.type==='blob'&&/\.html?$/i.test(n.path)).map(n=>n.path);
  }

  let paths=[];
  try{
    paths=await scanBranch(state.workBranch);
  }catch(e){
    if(e.status!==404) throw e;
  }
  if(!paths.length && state.workBranch!==state.defaultBranch){
    paths=await scanBranch(state.defaultBranch);
  }

  const recs=await Promise.all(paths.map(p=>fetchFile(p).catch(e=>{
    console.warn('scan skip',p,e); return null;
  })));
  for(const r of recs){
    if(!r) continue;
    state.files.set(r.path,r);
    parseFileFragments(r);
  }
}

function relabelFromManifest(manifest){
  if(!manifest) return;
  for(const e of manifest){
    const f=state.frags.get(e.id);
    if(f) f.label=e.label;
  }
}
function buildManifestFromState(){
  return [...state.frags.values()].map(f=>({id:f.id,file:f.path,label:f.label}));
}

/* ---------- rendering ---------- */
function setStatus(txt,busy){
  el('statusTxt').textContent=txt;
  el('refreshBtn').querySelector('svg').classList.toggle('spin',!!busy);
}

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

function selectFragment(id){
  if(state.activeId && state.activeId!==id) syncActiveFromTextarea();
  state.activeId=id;
  const f=state.frags.get(id);
  el('emptyState').style.display='none';
  el('editorPane').style.display='flex';
  el('edId').textContent='#'+f.id;
  el('edFile').textContent=f.path;
  el('edLabel').value=f.label;
  el('htmlArea').value=f.innerHTML;
  el('wrapInfo').textContent=f.mode==='marker' ? `<!-- cms:start ${f.markerId||f.id} --> ${f.openTag} … ${f.closeTag||'</section>'} <!-- cms:end ${f.markerId||f.id} -->` : `${f.openTag} … ${f.closeTag||'</section>'}`;
  el('sbPath').textContent=f.path;
  updatePreview(f);
  updateUnsavedBar();
  // active highlight
  document.querySelectorAll('.frag-row').forEach(r=>r.classList.toggle('active',r.dataset.id===id));
}

function syncActiveFromTextarea(){
  const f=state.frags.get(state.activeId); if(!f) return;
  f.innerHTML=el('htmlArea').value;
  f.dirty=(f.innerHTML!==f.origHTML)||(labelChanged(f));
}
function labelChanged(f){
  const m=state.manifest&&state.manifest.find(e=>e.id===f.id);
  const orig=m?m.label:f.id;
  return f.label!==orig;
}

/* Rewrite media src URLs in fragment HTML so the sandboxed preview iframe
   can load images directly from GitHub raw content (work branch), rather
   than trying to resolve site-relative paths that only work after publish. */
function rewritePreviewUrls(html){
  if(!state.owner || !state.repo) return html;
  const prefix=mediaPrefix(); // e.g. 'assets/media/' for GitHub Pages project sites
  const dir=mediaDir();       // e.g. 'docs/assets/media'
  if(!prefix || !dir || prefix.includes('{path}') || prefix.includes('{file}')) return html;
  const encodedDir=dir.split('/').map(encodeURIComponent).join('/');
  const rawBase=`https://raw.githubusercontent.com/${state.owner}/${state.repo}/${encodeURIComponent(state.workBranch)}/${encodedDir}/`;
  const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const version=Date.now();
  return html.replace(new RegExp(`(src=["'])${escRe(prefix)}([^"']+)(["'])`,'gi'),(m,start,rest,end)=>{
    const sep=rest.includes('?') ? '&' : '?';
    return `${start}${rawBase}${rest}${sep}v=${version}${end}`;
  });
}


function isExternalOrSpecialUrl(url){
  return /^(https?:|data:|blob:|mailto:|tel:|javascript:|#)/i.test(String(url||'').trim());
}
function normalizePathParts(path){
  const parts=[];
  for(const part of String(path||'').split('/')){
    if(!part || part==='.') continue;
    if(part==='..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}
function resolveRepoRelativeUrl(url,filePath){
  const raw=String(url||'').trim();
  if(!raw || isExternalOrSpecialUrl(raw)) return null;

  const [pathPart, suffixPart=''] = raw.split(/([?#].*)/,2);
  const suffix=raw.slice(pathPart.length);

  // Root-style site path, useful if old content still has /assets/...
  if(pathPart.startsWith('/')){
    return normalizePathParts('docs/' + pathPart.replace(/^\/+/,'') ) + suffix;
  }

  const dir=normalizeRepoPath(filePath).split('/').slice(0,-1).join('/');
  return normalizePathParts((dir ? dir + '/' : '') + pathPart) + suffix;
}
function rawUrlForPreviewAsset(url,filePath){
  const repoPath=resolveRepoRelativeUrl(url,filePath);
  if(!repoPath) return url;
  const [pathOnly, suffix=''] = repoPath.split(/([?#].*)/,2);
  const realSuffix=repoPath.slice(pathOnly.length);
  return rawUrlForRepoPath(pathOnly) + realSuffix + (realSuffix ? '&' : '?') + 'v=' + Date.now();
}
function rewriteFullPageAssetUrls(pageHtml,filePath){
  return String(pageHtml||'')
    .replace(/\s(href)=["']([^"']+)["']/gi,(m,attr,url)=>{
      // Only rewrite stylesheet links and common local asset hrefs.
      if(isExternalOrSpecialUrl(url)) return m;
      if(!/\.(css|ico|png|jpe?g|gif|webp|svg|avif)([?#].*)?$/i.test(url)) return m;
      return ` ${attr}="${escAttr(rawUrlForPreviewAsset(url,filePath))}"`;
    })
    .replace(/\s(src|poster)=["']([^"']+)["']/gi,(m,attr,url)=>{
      if(isExternalOrSpecialUrl(url)) return m;
      return ` ${attr}="${escAttr(rawUrlForPreviewAsset(url,filePath))}"`;
    })
    .replace(/\s(srcset)=["']([^"']+)["']/gi,(m,attr,value)=>{
      const rewritten=value.split(',').map(part=>{
        const bits=part.trim().split(/\s+/);
        if(!bits[0]) return part;
        bits[0]=rawUrlForPreviewAsset(bits[0],filePath);
        return bits.join(' ');
      }).join(', ');
      return ` ${attr}="${escAttr(rewritten)}"`;
    });
}
function updatePreviewModeButtons(){
  const fragBtn=el('previewFragmentBtn');
  const pageBtn=el('previewPageBtn');
  if(!fragBtn || !pageBtn) return;
  fragBtn.classList.toggle('active',state.previewMode==='fragment');
  pageBtn.classList.toggle('active',state.previewMode==='page');
}
function buildFragmentPreview(f){
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    ${previewCssTags()}
    <style>
      html,body{min-height:100%;margin:0}
      body{font-family:system-ui,sans-serif;color:#1a1a1a;padding:24px;box-sizing:border-box}
      img{max-width:100%;height:auto}
      *{box-sizing:border-box}
    </style></head>
    <body>${rewritePreviewUrls(rebuildFragment(f))}</body></html>`;
}
function buildPagePreview(f){
  const fileRec=state.files.get(f.path);
  if(!fileRec) return buildFragmentPreview(f);

  let page=fileRec.content;
  try{
    page=replaceFragment(page,f);
  }catch(e){
    return `<!DOCTYPE html><html><body style="font-family:system-ui;padding:24px;color:#1a1a1a">
      <h2>Page preview failed</h2>
      <p>${esc(e.message)}</p>
    </body></html>`;
  }

  page=rewriteFullPageAssetUrls(page,f.path);

  // Keep scripts inert even if the iframe sandbox changes later.
  page=page.replace(/<script\b/gi,'<script type="text/plain" data-gitcms-disabled');

  return page;
}

function updatePreview(f){
  updatePreviewModeButtons();
  el('preview').srcdoc = state.previewMode==='page' ? buildPagePreview(f) : buildFragmentPreview(f);
}

function updateUnsavedBar(){
  const anyDirty=[...state.frags.values()].some(f=>f.dirty);
  el('sbUnsaved').classList.toggle('show',anyDirty);
}


/* ---------- HTML snippets ---------- */
function selectedEditorText(){
  const ta=el('htmlArea');
  const start=ta.selectionStart ?? 0;
  const end=ta.selectionEnd ?? 0;
  return ta.value.slice(start,end);
}
function snippetTemplate(type,selection=''){
  const text=selection.trim();

  switch(type){
    case 'p':
      return `<p>${esc(text || 'New paragraph')}</p>`;
    case 'h2':
      return `<h2>${esc(text || 'New heading')}</h2>`;
    case 'lede':
      return `<p class="lede">${esc(text || 'Intro text')}</p>`;
    case 'button':
      return `<a class="btn" href="contact.html">${esc(text || 'Call to action')}</a>`;
    case 'list':
      if(text){
        const items=text.split(/\n+/).map(x=>x.trim()).filter(Boolean);
        return `<ul>\n${items.map(x=>`  <li>${esc(x)}</li>`).join('\n')}\n</ul>`;
      }
      return `<ul>\n  <li>First item</li>\n  <li>Second item</li>\n</ul>`;
    case 'card':
      return `<div class="card">\n  <h3>${esc(text || 'Card title')}</h3>\n  <p>Card text.</p>\n</div>`;
    default:
      return '';
  }
}
function insertHtmlSnippet(type){
  const ta=el('htmlArea');
  if(!state.activeId || !ta) {
    toast('Select a fragment first','err');
    return;
  }
  const snippet=snippetTemplate(type,selectedEditorText());
  if(!snippet) return;
  insertAtCursor(ta,snippet);
  toast('Snippet inserted','ok');
}

/* ---------- editing events ---------- */

el('previewFragmentBtn').onclick=()=>{
  state.previewMode='fragment';
  const f=state.frags.get(state.activeId);
  if(f) updatePreview(f);
};
el('previewPageBtn').onclick=()=>{
  state.previewMode='page';
  const f=state.frags.get(state.activeId);
  if(f) updatePreview(f);
};


document.querySelectorAll('[data-snippet]').forEach(btn=>{
  btn.addEventListener('click',()=>insertHtmlSnippet(btn.dataset.snippet));
});

el('htmlArea').addEventListener('input',()=>{
  const f=state.frags.get(state.activeId); if(!f) return;
  f.innerHTML=el('htmlArea').value;
  f.dirty=(f.innerHTML!==f.origHTML)||labelChanged(f);
  updatePreview(f);
  reflectDirty(f);
});
el('edLabel').addEventListener('input',()=>{
  const f=state.frags.get(state.activeId); if(!f) return;
  f.label=el('edLabel').value;
  f.dirty=(f.innerHTML!==f.origHTML)||labelChanged(f);
  const row=document.querySelector(`.frag-row[data-id="${cssEsc(f.id)}"] .flabel`);
  if(row) row.textContent=f.label;
  reflectDirty(f);
});
function cssEsc(s){return (window.CSS&&CSS.escape)?CSS.escape(s):s.replace(/"/g,'\\"');}
function reflectDirty(f){
  const row=document.querySelector(`.frag-row[data-id="${cssEsc(f.id)}"]`);
  if(row) row.classList.toggle('dirty',f.dirty);
  const group=document.querySelector(`.file-group[data-path="${cssEsc(f.path)}"]`);
  if(group){
    const anyDirty=state.files.get(f.path).fragments.some(id=>state.frags.get(id)?.dirty);
    group.classList.toggle('has-dirty',anyDirty);
  }
  updateUnsavedBar();
}

el('resetBtn').onclick=()=>{
  const f=state.frags.get(state.activeId); if(!f) return;
  f.innerHTML=f.origHTML;
  const m=state.manifest&&state.manifest.find(e=>e.id===f.id);
  f.label=m?m.label:f.id;
  f.dirty=false;
  el('htmlArea').value=f.innerHTML;
  el('edLabel').value=f.label;
  const row=document.querySelector(`.frag-row[data-id="${cssEsc(f.id)}"] .flabel`);
  if(row) row.textContent=f.label;
  updatePreview(f); reflectDirty(f);
  toast('Reset to last loaded version');
};

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



/* ---------- image insert / alt text ---------- */
let pendingMediaInsert=null;

function altFromFilename(name){
  return String(name||'')
    .replace(/\.[^.]+$/,'')
    .replace(/[-_]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function openAltDialog(media){
  pendingMediaInsert=media;
  el('altImageName').textContent=media.name || media.url || '';
  el('altTextInput').value=altFromFilename(media.name);
  el('altDecorative').checked=false;
  el('altTextInput').disabled=false;
  el('altModal').classList.add('show');
  setTimeout(()=>el('altTextInput').select(),0);
}

function closeAltDialog(){
  el('altModal').classList.remove('show');
  pendingMediaInsert=null;
}

function confirmAltInsert(){
  if(!pendingMediaInsert) return;
  const decorative=el('altDecorative').checked;
  const alt=decorative ? '' : el('altTextInput').value.trim();
  const tag=`<img src="${escAttr(pendingMediaInsert.url)}" alt="${escAttr(alt)}">`;
  insertAtCursor(el('htmlArea'),tag);
  closeAltDialog();
  el('mediaModal').classList.remove('show');
  toast('Image inserted','ok');
}

/* ---------- media library ---------- */
const IMAGE_RE=/\.(png|jpe?g|gif|webp|svg|avif)$/i;
let gitcmsConfig=null;
let gitcmsConfigLoaded=false;
const pendingMediaPreviews=new Map(); // path -> {url,name,path,size,type,sha,expiresAt}

async function loadGitCMSConfig(force=false,refs=null){
  if(gitcmsConfigLoaded && !force) return gitcmsConfig;
  gitcmsConfigLoaded=true;
  gitcmsConfig=null;
  state.validation.config=[];

  const refsToTry=refs||[state.workBranch,state.defaultBranch];
  for(const ref of refsToTry){
    try{
      const r=await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(CONFIG_PATH)}?ref=${encodeURIComponent(ref)}`);
      let parsed=null;
      try{
        parsed=JSON.parse(dec(r.content));
      }catch(parseErr){
        addValidation('config', `${CONFIG_PATH} on ${ref}: invalid JSON — ${parseErr.message}`);
        return null;
      }

      gitcmsConfig=parsed;
      state.validation.config.push(...validateGitCMSConfig(parsed,`${CONFIG_PATH} on ${ref}`));
      return gitcmsConfig;
    }catch(e){
      if(e.status===404) continue;
      addValidation('config', `${CONFIG_PATH}: config load failed — ${e.message}`);
      console.warn('config load failed',e);
      return null;
    }
  }

  state.validation.config.push(...validateGitCMSConfig(null,CONFIG_PATH));
  return null;
}

function configMedia(){
  const media=gitcmsConfig && gitcmsConfig.media;
  return media && typeof media==='object' ? media : null;
}

function updateMediaDirNote(){
  const dir=mediaDir();
  el('mediaDirNote').innerHTML=`Folder: <span class="mono">${esc(dir)}</span> — <button class="tbtn ghost" style="padding:2px 6px;font-size:11px;display:inline-flex" onclick="el('mediaModal').classList.remove('show');openSettings()">change in Settings</button>`;
  el('mediaBranchNote').textContent=state.workBranch;
}

function openSettings(){
  const cfg=gitcmsConfig||{};
  const media=(cfg.media && typeof cfg.media==='object') ? cfg.media : {};
  el('cfgWorkBranch').textContent=state.workBranch;
  el('settingsWorkBranchNote').textContent=state.workBranch;
  el('cfgManifestPath').value=state.manifestPath||DEFAULT_MANIFEST_PATH;
  el('cfgMediaDir').value=media.dir||DEFAULT_MEDIA_DIR;
  el('cfgMediaPrefix').value=media.publicPrefix||defaultPublicPrefixFor(normalizeRepoPath(media.dir||DEFAULT_MEDIA_DIR));
  el('cfgPreviewCss').value=previewCssList().join(', ');
  el('settingsErr').classList.remove('show');
  el('settingsModal').classList.add('show');
  el('cfgManifestPath').focus();
}

async function saveConfig(){
  const newManifestPath=normalizeRepoPath(el('cfgManifestPath').value)||DEFAULT_MANIFEST_PATH;
  const newMediaDir=normalizeRepoPath(el('cfgMediaDir').value)||DEFAULT_MEDIA_DIR;
  const newMediaPrefix=normalizePublicPrefix(el('cfgMediaPrefix').value,newMediaDir);
  const newPreviewCss=el('cfgPreviewCss').value.split(',').map(x=>x.trim()).filter(Boolean);
  el('settingsErr').classList.remove('show');

  const btn=el('settingsSave');
  btn.disabled=true; btn.textContent='Saving…';

  try{
    const existing=(await loadGitCMSConfig(true,[state.workBranch,state.defaultBranch]))||{};
    const next={
      ...existing,
      // workBranch is preserved as-is from existing config (not editable in UI)
      manifestPath:newManifestPath,
      media:{
        ...(existing.media && typeof existing.media==='object' ? existing.media : {}),
        dir:newMediaDir,
        publicPrefix:newMediaPrefix
      },
      preview:{
        ...(existing.preview && typeof existing.preview==='object' ? existing.preview : {}),
        css:newPreviewCss
      }
    };
    // Only include workBranch if it was already in config; don't inject a default.
    if(!('workBranch' in next) && state.workBranch!==DEFAULT_WORK_BRANCH){
      next.workBranch=state.workBranch;
    }

    let sha=null;
    try{
      const cur=await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(CONFIG_PATH)}?ref=${encodeURIComponent(state.workBranch)}`);
      sha=cur.sha;
    }catch(e){ if(e.status!==404) throw e; }

    await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(CONFIG_PATH)}`,{
      method:'PUT',
      body:{
        message:'cms: update GitCMS config',
        content:enc(JSON.stringify(next,null,2)+'\n'),
        branch:state.workBranch,
        ...(sha?{sha}:{})
      }
    });

    const manifestChanged=newManifestPath!==state.manifestPath;
    gitcmsConfig=next;
    gitcmsConfigLoaded=true;
    state.manifestPath=newManifestPath;
    updateBranchLabels();
    updateMediaDirNote();

    el('settingsModal').classList.remove('show');
    toast('Config saved to '+state.workBranch,'ok');

    // Reload if manifest path changed — fragments source has moved.
    if(manifestChanged) await loadAll();
  }catch(e){
    el('settingsErr').textContent='Save failed: '+e.message;
    el('settingsErr').classList.add('show');
    toast('Config save failed','err');
  }finally{
    btn.disabled=false; btn.textContent='Save config';
  }
}

function showMediaErr(msg){
  const err=el('mediaErr');
  err.textContent=msg;
  err.classList.add('show');
}
function clearMediaErr(){
  const err=el('mediaErr');
  err.textContent='';
  err.classList.remove('show');
  clearMediaWarn();
}
function showMediaWarn(html){
  const warn=el('mediaWarn');
  warn.innerHTML=html;
  warn.classList.add('show');
}
function clearMediaWarn(){
  const warn=el('mediaWarn');
  if(!warn) return;
  warn.innerHTML='';
  warn.classList.remove('show');
}
function setMediaGridEmpty(msg){
  el('mediaGrid').innerHTML=`<div class="media-empty">${esc(msg)}</div>`;
}

async function openMedia(){
  clearMediaErr();
  el('mediaModal').classList.add('show');
  // Ensure config is loaded so mediaDir() returns the correct path from gitcms.config.json.
  if(!gitcmsConfigLoaded) await loadGitCMSConfig();
  updateMediaDirNote();
  await loadMedia();
}

async function loadMedia(silent=false){
  if(!silent) clearMediaErr();
  const dir=mediaDir();
  if(!dir){ if(!silent) showMediaErr('Set a repository folder first.'); return; }

  const grid=el('mediaGrid');
  if(!silent) setMediaGridEmpty('Loading images…');

  try{
    const items=await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(dir)}?ref=${encodeURIComponent(state.workBranch)}`);
    const images=(Array.isArray(items)?items:[]).filter(i=>i.type==='file'&&IMAGE_RE.test(i.name));
    const now=Date.now();
    const seen=new Set(images.map(i=>i.path));

    // Keep local previews visible for just-uploaded images while GitHub's raw/API
    // edge caches settle. This prevents thumbnail appear → vanish → reappear.
    for(const [path,p] of [...pendingMediaPreviews]){
      if(p.expiresAt<=now){
        URL.revokeObjectURL(p.url);
        pendingMediaPreviews.delete(path);
      }
    }

    const cards=[];
    for(const item of images) cards.push(item);
    for(const [path,p] of pendingMediaPreviews){
      if(!seen.has(path)) cards.push(p);
    }

    if(!cards.length){
      setMediaGridEmpty(`No images found in ${dir}. Upload one to create/use this folder.`);
      return;
    }

    grid.innerHTML='';
    for(const item of cards.sort((a,b)=>a.name.localeCompare(b.name))){
      const pending=pendingMediaPreviews.get(item.path);
      renderMediaCard(item,pending?{localUrl:pending.url}:{});
    }
  }catch(e){
    if(silent) return; // ignore errors on background refresh
    if(e.status===404){
      if(pendingMediaPreviews.size){
        grid.innerHTML='';
        for(const p of pendingMediaPreviews.values()) renderMediaCard(p,{localUrl:p.url});
      }else{
        setMediaGridEmpty(`Folder not found yet: ${dir}. Upload an image to create it.`);
      }
    }else{
      setMediaGridEmpty('Could not load media.');
      showMediaErr('Media load failed: '+e.message);
    }
  }
}

function renderMediaCard(item,{localUrl=null}={}){
  const card=document.createElement('div');
  card.className='media-card';
  card.title=item.path;
  card.innerHTML=`
    <button class="media-insert" type="button" title="Insert ${escAttr(item.path)}" style="display:block;width:100%;text-align:left">
      <div class="media-thumb placeholder">loading</div>
      <div class="media-name">${esc(item.name)}</div>
      <div class="media-path">${esc(item.path)}</div>
    </button>
    <div class="media-actions">
      <button class="media-action insert" type="button">Insert</button>
      <button class="media-action copy" type="button" title="Copy public media URL">Copy</button>
      <button class="media-action delete" type="button">Delete</button>
    </div>`;
  el('mediaGrid').appendChild(card);

  card.querySelector('.media-insert').onclick=()=>insertMediaImage(item.path);
  card.querySelector('.media-action.insert').onclick=()=>insertMediaImage(item.path);
  card.querySelector('.media-action.copy').onclick=()=>copyMediaUrl(item.path);
  card.querySelector('.media-action.delete').onclick=()=>openDeleteMediaDialog(item,card);

  const slot=card.querySelector('.media-thumb');
  if(localUrl){
    const img=document.createElement('img');
    img.className='media-thumb';
    img.alt=item.name;
    img.src=localUrl;
    slot.replaceWith(img);
  }else{
    loadMediaThumb(item,slot);
  }
}

async function loadMediaThumb(item,slot,attempt=0){
  try{
    if(item.size && item.size>3_000_000){
      slot.textContent='large file';
      return;
    }
    const r=await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(item.path)}?ref=${encodeURIComponent(state.workBranch)}&v=${encodeURIComponent(item.sha||Date.now())}`);
    const img=document.createElement('img');
    img.className='media-thumb';
    img.alt=item.name;
    img.src=`data:${mimeFromName(item.name)};base64,${String(r.content||'').replace(/\s/g,'')}`;
    slot.replaceWith(img);
  }catch(e){
    if(attempt<5 && slot.isConnected){
      slot.textContent='retrying';
      const delays=[1000,2000,4000,8000,12000];
      setTimeout(()=>{
        if(slot.isConnected) loadMediaThumb(item,slot,attempt+1);
      },delays[attempt]);
    }else{
      slot.textContent='no preview';
    }
  }
}


async function copyTextToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch(e){
    const ta=document.createElement('textarea');
    ta.value=text;
    ta.style.position='fixed';
    ta.style.left='-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try{
      document.execCommand('copy');
      return true;
    }catch(err){
      return false;
    }finally{
      ta.remove();
    }
  }
}

async function copyMediaUrl(path){
  const url=mediaPublicUrl(path);
  const ok=await copyTextToClipboard(url);
  if(ok) toast('Copied media URL','ok');
  else {
    showMediaErr('Copy failed. URL: '+url);
    toast('Copy failed','err');
  }
}

function insertMediaImage(path){
  if(!state.activeId){
    toast('Select a fragment before inserting media','err');
    return;
  }
  openAltDialog({
    url: mediaPublicUrl(path),
    name: path.split('/').pop()
  });
}


let pendingDeleteMedia=null;

function mediaUsageList(path){
  const url=mediaPublicUrl(path);
  const name=path.split('/').pop();
  const needles=[url,name].filter(Boolean);
  const hits=[];
  for(const f of state.frags.values()){
    const html=f.innerHTML||'';
    if(needles.some(n=>n && html.includes(n))){
      hits.push(`${f.label || f.id} (${f.path})`);
    }
  }
  return hits;
}

function openDeleteMediaDialog(item,card=null){
  pendingDeleteMedia={item,card};
  const path=item.path;
  const name=item.name || path.split('/').pop();
  const usage=mediaUsageList(path);

  el('deleteBranchName').textContent=state.workBranch;
  el('deleteMediaTarget').textContent=name + ' — ' + path;
  el('deleteMediaErr').classList.remove('show');
  el('deleteMediaErr').textContent='';

  const usageBox=el('deleteMediaUsage');
  if(usage.length){
    const shown=usage.slice(0,8).map(x=>`<li>${esc(x)}</li>`).join('');
    const more=usage.length>8 ? `<li>…and ${usage.length-8} more</li>` : '';
    usageBox.innerHTML=`<b>Possible usage found.</b> Deleting may break images in:<ul>${shown}${more}</ul>`;
    usageBox.classList.add('show');
  }else{
    usageBox.innerHTML='';
    usageBox.classList.remove('show');
  }

  el('deleteMediaConfirm').disabled=false;
  el('deleteMediaConfirm').textContent='Delete';
  el('deleteMediaModal').classList.add('show');
}

function closeDeleteMediaDialog(){
  el('deleteMediaModal').classList.remove('show');
  pendingDeleteMedia=null;
}

async function confirmDeleteMedia(){
  if(!pendingDeleteMedia) return;
  const {item,card}=pendingDeleteMedia;
  const path=item.path;
  const name=item.name || path.split('/').pop();

  const btn=el('deleteMediaConfirm');
  btn.disabled=true;
  btn.textContent='Deleting…';
  el('deleteMediaErr').classList.remove('show');

  if(card) card.classList.add('deleting');

  try{
    let sha=item.sha || null;
    if(!sha){
      const cur=await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(path)}?ref=${encodeURIComponent(state.workBranch)}`);
      sha=cur.sha;
    }

    await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(path)}`,{
      method:'DELETE',
      body:{
        message:'cms: delete media '+name,
        sha,
        branch:state.workBranch
      }
    });

    const pending=pendingMediaPreviews.get(path);
    if(pending && pending.url) URL.revokeObjectURL(pending.url);
    pendingMediaPreviews.delete(path);

    el('deleteMediaModal').classList.remove('show');
    pendingDeleteMedia=null;
    toast('Deleted from '+state.workBranch,'ok');
    await loadMedia();
  }catch(e){
    if(card) card.classList.remove('deleting');
    const err=el('deleteMediaErr');
    err.textContent='Delete failed: '+e.message;
    err.classList.add('show');
    toast('Delete failed','err');
  }finally{
    btn.disabled=false;
    btn.textContent='Delete';
  }
}

function insertAtCursor(textarea,text){
  textarea.focus();
  const start=textarea.selectionStart ?? textarea.value.length;
  const end=textarea.selectionEnd ?? textarea.value.length;
  const before=textarea.value.slice(0,start);
  const after=textarea.value.slice(end);
  const spacerBefore=before && !before.endsWith('\n') ? '\n' : '';
  const spacerAfter=after && !after.startsWith('\n') ? '\n' : '';
  const insert=spacerBefore + text + spacerAfter;
  textarea.value=before + insert + after;
  const pos=start + insert.length;
  textarea.setSelectionRange(pos,pos);
  textarea.dispatchEvent(new Event('input',{bubbles:true}));
}

function sanitizeFilename(name){
  const parts=name.split('.');
  const ext=parts.length>1 ? '.'+parts.pop().toLowerCase().replace(/[^a-z0-9]/g,'') : '';
  const base=parts.join('.').toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'image';
  return base + ext;
}
function readFileBase64(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Could not read file: '+file.name));
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}


async function mediaPathExists(path){
  try{
    await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(path)}?ref=${encodeURIComponent(state.workBranch)}`);
    return true;
  }catch(e){
    if(e.status===404) return false;
    throw e;
  }
}

async function uniqueMediaPath(dir,name){
  let candidate=`${dir}/${name}`;
  if(!(await mediaPathExists(candidate))) return {path:candidate,name,changed:false};

  const dot=name.lastIndexOf('.');
  const base=dot>0 ? name.slice(0,dot) : name;
  const ext=dot>0 ? name.slice(dot) : '';

  for(let i=2;i<=99;i++){
    const nextName=`${base}-${i}${ext}`;
    const nextPath=`${dir}/${nextName}`;
    if(!(await mediaPathExists(nextPath))){
      return {path:nextPath,name:nextName,changed:true,original:name};
    }
  }

  throw new Error('Could not find a free filename for '+name);
}

async function uploadMediaFiles(){
  const input=el('mediaUpload');
  const files=[...input.files];
  if(!files.length) return;
  clearMediaErr();
  const dir=mediaDir();
  if(!dir){ showMediaErr('Set a repository folder first.'); return; }

  try{
    const stamp=new Date().toISOString().replace(/[:.]/g,'-').replace('T','-').slice(0,19);
    const uploaded=[];
    const renamed=[];

    for(let i=0;i<files.length;i++){
      const file=files[i];
      if(!file.type.startsWith('image/')) throw new Error(file.name+' is not an image.');

      const desiredName=(files.length>1 ? `${stamp}-${i+1}-` : `${stamp}-`) + sanitizeFilename(file.name);
      const unique=await uniqueMediaPath(dir,desiredName);
      const name=unique.name;
      const path=unique.path;

      if(unique.changed){
        renamed.push({from:unique.original,to:name});
      }

      const localUrl=URL.createObjectURL(file);

      // Register the local preview before upload completes. If GitHub/raw caches
      // lag for a few seconds, the UI still keeps a stable thumbnail.
      const pending={name,path,size:file.size,type:'file',url:localUrl,expiresAt:Date.now()+90_000};
      pendingMediaPreviews.set(path,pending);

      const content=await readFileBase64(file);
      const put=await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(path)}`,{
        method:'PUT',
        body:{message:'cms: upload media '+name,content,branch:state.workBranch}
      });
      pending.sha=put && put.content ? put.content.sha : null;
      uploaded.push(pending);
    }

    input.value='';
    toast(files.length===1?'Image uploaded to '+state.workBranch:'Images uploaded to '+state.workBranch,'ok');

    if(renamed.length){
      const rows=renamed.slice(0,6).map(r=>`<div><span class="mono">${esc(r.from)}</span> already existed → <span class="mono">${esc(r.to)}</span></div>`).join('');
      const more=renamed.length>6 ? `<div>…and ${renamed.length-6} more</div>` : '';
      showMediaWarn(`<b>Upload renamed to avoid overwriting existing media.</b>${rows}${more}`);
    }

    const grid=el('mediaGrid');
    if(grid.querySelector('.media-empty')) grid.innerHTML='';
    for(const item of uploaded) renderMediaCard(item,{localUrl:item.url});

    // Refresh several times without clearing the grid. This lets GitHub's API/raw
    // edge caches catch up while the local preview remains visible.
    [1500,4000,9000,20000].forEach(ms=>sleep(ms).then(()=>loadMedia(true)));
  }catch(e){
    showMediaErr('Upload failed: '+e.message);
    toast('Upload failed','err');
  }
}

el('settingsBtn').onclick=openSettings;
el('settingsClose').onclick=()=>el('settingsModal').classList.remove('show');
el('settingsSave').onclick=saveConfig;
el('mediaBtn').onclick=openMedia;
el('mediaClose').onclick=()=>el('mediaModal').classList.remove('show');
el('mediaRefreshBtn').onclick=loadMedia;
el('mediaUpload').addEventListener('change',uploadMediaFiles);

/* ---------- save manifest (when none existed) ---------- */
el('saveManifestBtn').onclick=async()=>{
  const man=[...state.frags.values()].map(f=>({id:f.id,file:f.path,label:f.label}));
  try{
    let sha=null;
    try{
      const cur=await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(state.manifestPath)}?ref=${encodeURIComponent(state.workBranch)}`);
      sha=cur.sha;
    }catch(e){ if(e.status!==404) throw e; }

    await gh(`/repos/${state.owner}/${state.repo}/contents/${ghPath(state.manifestPath)}`,{
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
    const compare=await gh(`/repos/${state.owner}/${state.repo}/compare/${base}...${head}`);
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

/* ---------- publish ---------- */
el('publishBtn').onclick=openPublishModal;
el('pubCancel').onclick=()=>el('pubModal').classList.remove('show');
el('pubConfirm').onclick=doPublish;

async function syncWorkBranchFromMain(){
  try{
    await gh(`/repos/${state.owner}/${state.repo}/merges`,{
      method:'POST',
      body:{base:state.workBranch,head:state.defaultBranch,commit_message:'cms: sync '+state.defaultBranch+' → '+state.workBranch}
    });
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
    await gh(`/repos/${state.owner}/${state.repo}/merges`,{
      method:'POST',
      body:{base:state.defaultBranch,head:state.workBranch,commit_message:'cms: publish '+state.workBranch+' → '+state.defaultBranch}
    });
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
    const pages=await gh(`/repos/${state.owner}/${state.repo}/pages`);
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
    const ref=await gh(`/repos/${state.owner}/${state.repo}/git/ref/heads/${state.defaultBranch}`);
    const sha=ref.object.sha;
    try{
      await gh(`/repos/${state.owner}/${state.repo}/git/refs/heads/${state.workBranch}`,{
        method:'PATCH', body:{sha,force:true}
      });
    }catch(e){
      if(e.status===404 || e.status===422){
        await gh(`/repos/${state.owner}/${state.repo}/git/refs`,{
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

/* ---------- prefill ---------- */
(function init(){
  const r=localStorage.getItem(LS_REPO), t=localStorage.getItem(LS_TOKEN);
  if(r) el('repoUrl').value=r;
  if(t){ try{ el('token').value=dec(t); }catch(e){} }
})();
