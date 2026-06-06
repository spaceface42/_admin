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


const FragmentParser = Object.freeze({
  findMarkedFragments,
  extractMarkedFragment,
  rebuildFragment,
  rebuildMarkedFragmentFromParts,
  parseFileFragments
});
