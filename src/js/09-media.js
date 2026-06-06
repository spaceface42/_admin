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
      const r=await GitHubApi.getFile(CONFIG_PATH,ref);
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
      const cur=await GitHubApi.getFile(CONFIG_PATH,state.workBranch);
      sha=cur.sha;
    }catch(e){ if(e.status!==404) throw e; }

    await GitHubApi.saveFile(CONFIG_PATH,{
      message:'cms: update GitCMS config',
      content:enc(JSON.stringify(next,null,2)+'\n'),
      branch:state.workBranch,
      sha
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
    const items=await GitHubApi.listContent(dir,state.workBranch);
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
    const r=await GitHubApi.getFile(item.path,state.workBranch);
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
      const cur=await GitHubApi.getFile(path,state.workBranch);
      sha=cur.sha;
    }

    await GitHubApi.deleteFile(path,{
      message:'cms: delete media '+name,
      sha,
      branch:state.workBranch
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
    await GitHubApi.getFile(path,state.workBranch);
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
      const put=await GitHubApi.saveFile(path,{message:'cms: upload media '+name,content,branch:state.workBranch});
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
