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
