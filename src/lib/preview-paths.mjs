function normalizeRepoPath(path){
  return (path||'').trim().replace(/^\/+|\/+$/g,'').replace(/\/+/g,'/');
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

function isExternalOrSpecialUrl(url){
  return /^(https?:|data:|blob:|mailto:|tel:|javascript:|#)/i.test(String(url||'').trim());
}

function escapeAttr(s){
  return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/"/g,'&quot;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function escapeRegExp(s){
  return String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

function splitPathSuffix(url){
  const raw=String(url||'').trim();
  const match=raw.match(/^([^?#]*)([?#].*)?$/);
  return {
    path:match ? match[1] : raw,
    suffix:match && match[2] ? match[2] : ''
  };
}

function encodeRepoPath(repoPath){
  return normalizeRepoPath(repoPath).split('/').map(encodeURIComponent).join('/');
}

function rawGitHubUrl({owner,repo,ref,repoPath}){
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${encodeRepoPath(repoPath)}`;
}

function addCacheBust(url,version){
  if(version===undefined || version===null || version==='') return url;
  return url + (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(version);
}

function resolveRepoRelativeUrl(url,filePath){
  const raw=String(url||'').trim();
  if(!raw || isExternalOrSpecialUrl(raw)) return null;

  const {path,suffix}=splitPathSuffix(raw);
  if(!path) return null;

  // Root-style site paths like /assets/file.png are mapped to docs/assets/file.png
  // because GitHub Pages project sites commonly publish from docs/.
  if(path.startsWith('/')){
    return normalizePathParts('docs/' + path.replace(/^\/+/,'')) + suffix;
  }

  const dir=normalizeRepoPath(filePath).split('/').slice(0,-1).join('/');
  return normalizePathParts((dir ? dir + '/' : '') + path) + suffix;
}

function rawUrlForPreviewAsset(url,filePath,ctx){
  const repoPath=resolveRepoRelativeUrl(url,filePath);
  if(!repoPath) return url;

  const {path,suffix}=splitPathSuffix(repoPath);
  const raw=rawGitHubUrl({
    owner:ctx.owner,
    repo:ctx.repo,
    ref:ctx.ref,
    repoPath:path
  }) + suffix;

  return addCacheBust(raw,ctx.version);
}

function rewriteFullPageAssetUrls(pageHtml,filePath,ctx){
  return String(pageHtml||'')
    .replace(/\s(href)=["']([^"']+)["']/gi,(m,attr,url)=>{
      if(isExternalOrSpecialUrl(url)) return m;
      if(!/\.(css|ico|png|jpe?g|gif|webp|svg|avif)([?#].*)?$/i.test(url)) return m;
      return ` ${attr}="${escapeAttr(rawUrlForPreviewAsset(url,filePath,ctx))}"`;
    })
    .replace(/\s(src|poster)=["']([^"']+)["']/gi,(m,attr,url)=>{
      if(isExternalOrSpecialUrl(url)) return m;
      return ` ${attr}="${escapeAttr(rawUrlForPreviewAsset(url,filePath,ctx))}"`;
    })
    .replace(/\s(srcset)=["']([^"']+)["']/gi,(m,attr,value)=>{
      const rewritten=value.split(',').map(part=>{
        const bits=part.trim().split(/\s+/);
        if(!bits[0]) return part;
        bits[0]=rawUrlForPreviewAsset(bits[0],filePath,ctx);
        return bits.join(' ');
      }).join(', ');
      return ` ${attr}="${escapeAttr(rewritten)}"`;
    });
}

function rewriteFragmentMediaUrls(fragmentHtml,ctx){
  if(!ctx.owner || !ctx.repo || !ctx.ref) return fragmentHtml;
  const prefix=String(ctx.mediaPrefix||'');
  const dir=normalizeRepoPath(ctx.mediaDir||'');
  if(!prefix || !dir || prefix.includes('{path}') || prefix.includes('{file}')) return fragmentHtml;

  const rawBase=`https://raw.githubusercontent.com/${encodeURIComponent(ctx.owner)}/${encodeURIComponent(ctx.repo)}/${encodeURIComponent(ctx.ref)}/${encodeRepoPath(dir)}/`;
  const version=ctx.version;

  return String(fragmentHtml||'').replace(new RegExp(`(src=["'])${escapeRegExp(prefix)}([^"']+)(["'])`,'gi'),(m,start,rest,end)=>{
    return `${start}${addCacheBust(rawBase + rest,version)}${end}`;
  });
}

export const PreviewPaths = Object.freeze({
  normalizeRepoPath,
  normalizePathParts,
  isExternalOrSpecialUrl,
  splitPathSuffix,
  resolveRepoRelativeUrl,
  rawGitHubUrl,
  rawUrlForPreviewAsset,
  rewriteFullPageAssetUrls,
  rewriteFragmentMediaUrls
});
