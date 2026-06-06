import { Paths } from './paths.mjs';
import { FragmentParser } from './fragment-parser.mjs';

export const Validation = Object.freeze({
  validateConfig(cfg,{source='config',owner='',repo=''}={}){
    const warnings=[];
    const add=m=>warnings.push(`${source}: ${m}`);
    if(!cfg || typeof cfg!=='object' || Array.isArray(cfg)){
      add('gitcms.config.json was not found or is not a JSON object.');
      return warnings;
    }
    if(typeof cfg.workBranch!=='string' || !cfg.workBranch.trim()) add('missing "workBranch". Recommended value: "content".');
    if(typeof cfg.manifestPath!=='string' || !cfg.manifestPath.trim()) add('missing "manifestPath". Recommended value: "fragments.json".');
    if(!cfg.media || typeof cfg.media!=='object' || Array.isArray(cfg.media)){
      add('missing "media" object.');
    }else{
      if(typeof cfg.media.dir!=='string' || !cfg.media.dir.trim()) add('missing "media.dir". Recommended for docs publishing: "docs/assets/media".');
      if(typeof cfg.media.publicPrefix!=='string' || !cfg.media.publicPrefix.trim()){
        add('missing "media.publicPrefix". Recommended for GitHub Pages project sites: "assets/media/".');
      }else{
        const prefix=cfg.media.publicPrefix.trim();
        if(prefix.startsWith('/') && Paths.isProjectPagesSite(owner,repo)){
          add('media.publicPrefix starts with "/". For GitHub Pages project sites, use a relative prefix like "assets/media/".');
        }
      }
    }
    if(cfg.preview!==undefined){
      if(!cfg.preview || typeof cfg.preview!=='object' || Array.isArray(cfg.preview)){
        add('"preview" must be an object if provided.');
      }else if(cfg.preview.css!==undefined){
        const css=Array.isArray(cfg.preview.css) ? cfg.preview.css : (typeof cfg.preview.css==='string' ? [cfg.preview.css] : null);
        if(!css) add('"preview.css" must be a string or an array of strings.');
        else css.forEach((p,i)=>{
          if(typeof p!=='string' || !p.trim()) add(`preview.css entry ${i+1} must be a non-empty string.`);
          if(typeof p==='string' && p.trim().startsWith('/')) add(`preview.css entry "${p}" starts with "/". For GitHub Pages project sites, use relative paths like "assets/style.css".`);
        });
      }
    }
    return warnings;
  },
  validateManifestEntries(manifest,{source='manifest'}={}){
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
  },
  validateMarkers(content,path='file'){
    return FragmentParser.validateMarkers(content,path);
  }
});
