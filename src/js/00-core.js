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

const LS_REPO='gitcms_repo', LS_TOKEN='gitcms_tok', LS_LAST_WRITE='gitcms_last_write_commits';
// TODO SECURITY:
// During development, the GitHub token is stored in localStorage for convenience.
// Before production/public use, replace this with sessionStorage, OAuth/device flow,
// or another safer auth model. Base64 is obfuscation only, not encryption.
const API='https://api.github.com';
const GITCMS_VERSION='1.1.30-github-api-module';
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
  contentTree:null,        // {branch, commitSha, treeSha, tree}
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




const LastWriteCommitCache = Object.freeze({
  ttlMs: 30*60*1000,
  readAll(){
    try{return JSON.parse(localStorage.getItem(LS_LAST_WRITE)||'{}')||{};}catch(e){return {};}
  },
  writeAll(data){
    try{localStorage.setItem(LS_LAST_WRITE,JSON.stringify(data));}catch(e){}
  },
  key(branch){
    return ContentSourceUtils.cacheKey({owner:state.owner,repo:state.repo,branch});
  },
  set(branch,sha){
    const data=ContentSourceUtils.writeCachedCommit(this.readAll(),{
      owner:state.owner,
      repo:state.repo,
      branch,
      sha,
      now:Date.now()
    });
    this.writeAll(data);
  },
  get(branch){
    if(!branch) return '';
    return ContentSourceUtils.cachedCommitIfFresh(this.readAll()[this.key(branch)],{
      now:Date.now(),
      ttlMs:this.ttlMs
    });
  },
  clear(branch){
    this.writeAll(ContentSourceUtils.clearCachedBranch(this.readAll(),{
      owner:state.owner,
      repo:state.repo,
      branch
    }));
  },
  clearRepo(){
    this.writeAll(ContentSourceUtils.clearCachedRepo(this.readAll(),{
      owner:state.owner,
      repo:state.repo
    }));
  }
});

const Store = Object.freeze({
  setRepo(owner,repo,token){
    state.owner=owner;
    state.repo=repo;
    state.token=token;
  },
  setDefaultBranch(branch){
    state.defaultBranch=branch||'main';
  },
  setWorkBranch(branch){
    state.workBranch=(branch||DEFAULT_WORK_BRANCH).trim();
  },
  setManifestPath(path){
    state.manifestPath=Paths.normalizeRepoPath(path)||DEFAULT_MANIFEST_PATH;
  },
  clearLoadedContent(){
    state.files.clear();
    state.frags.clear();
    state.activeId=null;
  },
  setContentTree(snapshot){
    state.contentTree=snapshot;
  },
  clearContentTree(){
    state.contentTree=null;
  },
  setManifest(manifest){
    state.manifest=manifest;
  },
  setActiveFragment(id){
    state.activeId=id;
  },
  addFile(fileRec){
    state.files.set(fileRec.path,fileRec);
  },
  removeFile(path){
    state.files.delete(path);
  },
  addFragment(fragment){
    state.frags.set(fragment.id,fragment);
  },
  manifestLabelForFragment(fragment){
    if(!fragment) return '';
    const entry=state.manifest&&state.manifest.find(e=>e.id===fragment.id);
    return entry&&entry.label ? entry.label : fragment.id;
  },
  isFragmentDirty(fragment){
    if(!fragment) return false;
    return String(fragment.innerHTML||'')!==String(fragment.origHTML||'') ||
      String(fragment.label||fragment.id)!==String(this.manifestLabelForFragment(fragment));
  },
  applyEditorValues(id,{html,label}={}){
    const fragment=state.frags.get(id);
    if(!fragment) return null;
    if(html!==undefined) fragment.innerHTML=html;
    if(label!==undefined) fragment.label=(String(label).trim()||fragment.id);
    fragment.dirty=this.isFragmentDirty(fragment);
    return fragment;
  },
  markFragmentClean(id){
    const fragment=state.frags.get(id);
    if(!fragment) return null;
    fragment.origHTML=fragment.innerHTML;
    fragment.dirty=false;
    return fragment;
  },
  dirtyFragments(){
    return [...state.frags.values()].filter(f=>f.dirty);
  },
  dirtyFragmentIdsForFile(fileRec){
    if(!fileRec || !Array.isArray(fileRec.fragments)) return [];
    return fileRec.fragments.filter(id=>state.frags.get(id)?.dirty);
  },
  clearValidationBucket(kind){
    if(state.validation && state.validation[kind]) state.validation[kind]=[];
  },
  resetRuntimeValidation(){
    state.validation.manifest=[];
    state.validation.markers=[];
    state.validation.runtime=[];
  }
});

const Paths = Object.freeze({
  githubPath(path){
    return String(path||'').split('/').map(encodeURIComponent).join('/');
  },
  normalizeRepoPath(path){
    return (path||'').trim().replace(/^\/+|\/+$/g,'').replace(/\/+/g,'/');
  },
  defaultPublicPrefixFor(dir){
    const clean=this.normalizeRepoPath(dir).replace(/^docs\//,'');
    return clean.replace(/\/?$/,'/');
  },
  normalizePublicPrefix(prefix,dir){
    let raw=(prefix||'').trim()||this.defaultPublicPrefixFor(dir);
    if(raw.includes('{path}') || raw.includes('{file}')) return raw;
    return raw.replace(/\/?$/,'/');
  },
  isProjectPagesSite(owner=state.owner,repo=state.repo){
    return !!(owner && repo && repo.toLowerCase()!==`${owner.toLowerCase()}.github.io`);
  },
  normalizePathParts(path){
    const parts=[];
    for(const part of String(path||'').split('/')){
      if(!part || part==='.') continue;
      if(part==='..') parts.pop();
      else parts.push(part);
    }
    return parts.join('/');
  },
  publicPathToRepoPath(publicPath){
    const clean=this.normalizeRepoPath(publicPath);
    if(!clean) return '';
    if(clean.startsWith('docs/')) return clean;
    return 'docs/' + clean;
  },
  mediaPublicUrl(repoPath,prefix=mediaPrefix()){
    const file=String(repoPath||'').split('/').pop();
    if(prefix.includes('{path}')) return prefix.replace('{path}', repoPath);
    if(prefix.includes('{file}')) return prefix.replace('{file}', file);
    return prefix.replace(/\/?$/,'/') + file;
  },
  rawUrlForRepoPath(path,ref=state.workBranch){
    const encoded=this.normalizeRepoPath(path).split('/').map(encodeURIComponent).join('/');
    return `https://raw.githubusercontent.com/${state.owner}/${state.repo}/${encodeURIComponent(ref)}/${encoded}`;
  }
});

function parseRepoUrl(url){
  return ConnectUtils.parseRepoUrl(url);
}



function ghPath(path){
  return Paths.githubPath(path);
}
function normalizeRepoPath(path){
  return Paths.normalizeRepoPath(path);
}
function defaultPublicPrefixFor(dir){
  return Paths.defaultPublicPrefixFor(dir);
}
function normalizePublicPrefix(prefix,dir){
  return Paths.normalizePublicPrefix(prefix,dir);
}
function mediaDir(){
  const m=configMedia();
  return Paths.normalizeRepoPath((m && m.dir) || DEFAULT_MEDIA_DIR);
}
function mediaPrefix(){
  const m=configMedia();
  const raw=(m && m.publicPrefix) || '';
  return Paths.normalizePublicPrefix(raw,mediaDir());
}

function contentAssetRef(){
  return state.contentTree && state.contentTree.commitSha ? state.contentTree.commitSha : state.workBranch;
}

function previewCssList(){
  const p=gitcmsConfig && gitcmsConfig.preview;
  if(!p || typeof p!=='object') return [];
  const css=Array.isArray(p.css) ? p.css : (typeof p.css==='string' ? [p.css] : []);
  return css.map(x=>String(x).trim()).filter(Boolean);
}
function publicPathToRepoPath(publicPath){
  return Paths.publicPathToRepoPath(publicPath);
}
function rawUrlForRepoPath(path){
  return Paths.rawUrlForRepoPath(path,contentAssetRef());
}
function previewCssTags(){
  if(!state.owner || !state.repo) return '';
  return previewCssList().map(path=>{
    const repoPath=Paths.publicPathToRepoPath(path);
    const href=Paths.rawUrlForRepoPath(repoPath,contentAssetRef()) + '?v=' + Date.now();
    return `<link rel="stylesheet" href="${escAttr(href)}">`;
  }).join('\n');
}

function mediaPublicUrl(path){
  return Paths.mediaPublicUrl(path,mediaPrefix());
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
