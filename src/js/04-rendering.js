/* ---------- rendering ---------- */
let previewBlobUrl=null;
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
  Store.setActiveFragment(id);
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
  const rawBase=`https://raw.githubusercontent.com/${state.owner}/${state.repo}/${encodeURIComponent(contentAssetRef())}/${encodedDir}/`;
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

function previewShell(body,{title='GitCMS Preview',extraHead=''}={}){
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    ${extraHead}
    <style>
      html,body{min-height:100%;margin:0}
      body{font-family:system-ui,sans-serif;color:#1a1a1a;padding:24px;box-sizing:border-box;background:#fff}
      img{max-width:100%;height:auto}
      *{box-sizing:border-box}
      .gitcms-preview-error{border:1px solid #f59e0b;background:#fffbeb;color:#78350f;border-radius:10px;padding:14px 16px;line-height:1.45}
      .gitcms-preview-error h2{margin:0 0 8px;font-size:18px}
      .gitcms-preview-error pre{white-space:pre-wrap;font-size:12px;overflow:auto}
    </style>
    <title>${esc(title)}</title></head><body>${body}</body></html>`;
}

function previewErrorDoc(title,message,details=''){
  return previewShell(
    `<div class="gitcms-preview-error"><h2>${esc(title)}</h2><p>${esc(message)}</p>${details?`<pre>${esc(details)}</pre>`:''}</div>`,
    {title}
  );
}

function buildFragmentPreview(f){
  try{
    if(!f) return previewErrorDoc('No fragment selected','Select a fragment to preview it.');
    return previewShell(rewritePreviewUrls(rebuildFragment(f)),{
      title:`Preview ${f.id}`,
      extraHead:previewCssTags()
    });
  }catch(e){
    console.error('Fragment preview failed',e);
    return previewErrorDoc('Fragment preview failed',e.message||String(e));
  }
}

function buildPagePreview(f){
  try{
    if(!f) return previewErrorDoc('No fragment selected','Select a fragment to preview it.');
    const fileRec=state.files.get(f.path);
    if(!fileRec) return buildFragmentPreview(f);

    let page=fileRec.content;
    try{
      page=replaceFragment(page,f);
    }catch(e){
      return previewErrorDoc('Page preview failed',e.message||String(e),'Falling back to Fragment mode usually still works.');
    }

    page=rewriteFullPageAssetUrls(page,f.path);

    // Keep scripts inert even if the iframe sandbox changes later.
    page=page.replace(/<script\b/gi,'<script type="text/plain" data-gitcms-disabled');

    // Add a small safety style and selected-fragment outline without depending on site CSS.
    page=page.replace('</head>', `<style>
      img{max-width:100%;height:auto}
      [data-fragment="${escAttr(f.id)}"], #${escAttr(f.id)}{outline:2px dashed rgba(37,99,235,.55);outline-offset:6px}
    </style></head>`);

    return page;
  }catch(e){
    console.error('Page preview failed',e);
    return previewErrorDoc('Page preview failed',e.message||String(e));
  }
}

function setPreviewDocument(html){
  const frame=el('preview');
  if(!frame) return;

  try{
    if(previewBlobUrl){
      URL.revokeObjectURL(previewBlobUrl);
      previewBlobUrl=null;
    }

    const blob=new Blob([html],{type:'text/html'});
    previewBlobUrl=URL.createObjectURL(blob);

    // Clear srcdoc so browser does not prefer stale srcdoc over blob URL.
    frame.removeAttribute('srcdoc');
    frame.src=previewBlobUrl;
  }catch(e){
    console.error('Blob preview failed, falling back to srcdoc',e);
    frame.removeAttribute('src');
    frame.srcdoc=html;
  }
}

function updatePreview(f){
  updatePreviewModeButtons();

  try{
    // Keep the active fragment synced before building preview.
    if(f && state.activeId===f.id && el('htmlArea')){
      f.innerHTML=el('htmlArea').value;
      f.label=(el('edLabel').value.trim()||f.id);
    }

    const html = state.previewMode==='page' ? buildPagePreview(f) : buildFragmentPreview(f);
    setPreviewDocument(html);
  }catch(e){
    console.error('Preview update failed',e);
    setPreviewDocument(previewErrorDoc('Preview update failed',e.message||String(e)));
  }
}

function updateUnsavedBar(){
  const anyDirty=[...state.frags.values()].some(f=>f.dirty);
  el('sbUnsaved').classList.toggle('show',anyDirty);
}
