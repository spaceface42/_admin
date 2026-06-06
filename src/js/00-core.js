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
const GITCMS_VERSION='1.1.40-diagnostics-ui-polish';
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

function parseRepoUrl(url){
  return ConnectUtils.parseRepoUrl(url);
}

function escAttr(s){
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
