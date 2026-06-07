function reEsc(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function cmsStartRe() {
  return /<!--\s*cms:start\s+([A-Za-z0-9_.:-]+)\s*-->/gi;
}
function attrGet(attrs, name) {
  const m = String(attrs || '').match(new RegExp(name + '\\s*=\\s*["\']([^"\']*)["\']', 'i'));
  return m ? m[1] : '';
}
function fragmentIdFromAttrs(attrs, fallback = '') {
  return attrGet(attrs, 'data-fragment') || attrGet(attrs, 'id') || fallback;
}
function findTagEnd(src, start) {
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}
function findFirstElement(block) {
  const re = /<([A-Za-z][A-Za-z0-9:-]*)(?=[\s>/])/g;
  let m;
  while ((m = re.exec(block))) {
    const openStart = m.index;
    const openEnd = findTagEnd(block, openStart);
    if (openEnd < 0) continue;
    const tag = m[1];
    const openTag = block.slice(openStart, openEnd + 1);
    const attrs = block.slice(openStart + 1 + tag.length, openEnd);
    return { tag, openStart, openEnd, openTag, attrs };
  }
  return null;
}
function findMatchingClose(block, tagName, from) {
  const re = new RegExp(`<\\/?${reEsc(tagName)}(?=[\\s>/])`, 'gi');
  re.lastIndex = from;
  let depth = 1,
    m;
  while ((m = re.exec(block))) {
    const idx = m.index;
    const isClose = block[idx + 1] === '/';
    const tagEnd = findTagEnd(block, idx);
    if (tagEnd < 0) return null;
    if (isClose) {
      depth--;
      if (depth === 0)
        return { closeStart: idx, closeEnd: tagEnd + 1, closeTag: block.slice(idx, tagEnd + 1) };
    } else {
      const open = block.slice(idx, tagEnd + 1);
      if (!/\/\s*>$/.test(open)) depth++;
    }
    re.lastIndex = tagEnd + 1;
  }
  return null;
}
function markerEndRegex(id) {
  return new RegExp(`<!--\\s*cms:end\\s+${reEsc(id)}\\s*-->`, 'i');
}
function classHasFragment(attrs) {
  const m = String(attrs || '').match(/class\s*=\s*["']([^"']*)["']/i);
  return m ? /\bfragment\b/.test(m[1]) : false;
}
function attrsDeclareFragment(attrs) {
  return !!attrGet(attrs, 'data-fragment') || classHasFragment(attrs);
}
function findMarkedFragments(content, wantedId = null) {
  const out = [];
  const startRe = cmsStartRe();
  let sm;
  while ((sm = startRe.exec(content))) {
    const markerId = sm[1];
    if (wantedId && markerId !== wantedId) continue;
    const afterStart = startRe.lastIndex;
    const endRe = markerEndRegex(markerId);
    const rest = content.slice(afterStart);
    const em = endRe.exec(rest);
    if (!em) continue;
    const blockStart = afterStart;
    const blockEnd = afterStart + em.index;
    const fullStart = sm.index;
    const fullEnd = blockEnd + em[0].length;
    const markerStart = content.slice(fullStart, blockStart);
    const markerEnd = content.slice(blockEnd, fullEnd);
    const block = content.slice(blockStart, blockEnd);
    const first = findFirstElement(block);
    if (!first) {
      startRe.lastIndex = fullEnd;
      continue;
    }
    const close = findMatchingClose(block, first.tag, first.openEnd + 1);
    if (!close) {
      startRe.lastIndex = fullEnd;
      continue;
    }
    const id = fragmentIdFromAttrs(first.attrs, markerId);
    if (!id) {
      startRe.lastIndex = fullEnd;
      continue;
    }
    if (wantedId && id !== wantedId && markerId !== wantedId) {
      startRe.lastIndex = fullEnd;
      continue;
    }
    out.push({
      mode: 'marker',
      markerId,
      id,
      tag: first.tag,
      attrs: first.attrs,
      openTag: first.openTag,
      closeTag: close.closeTag,
      innerHTML: block.slice(first.openEnd + 1, close.closeStart),
      blockPrefix: block.slice(0, first.openStart),
      blockSuffix: block.slice(close.closeEnd),
      markerStart,
      markerEnd,
      fullStart,
      fullEnd
    });
    startRe.lastIndex = fullEnd;
    if (wantedId) break;
  }
  return out;
}
function extractMarkedFragment(content, wantedId = null) {
  return findMarkedFragments(content, wantedId)[0] || null;
}
function rebuildMarkedFragmentFromParts(parts, innerHTML) {
  return (
    parts.markerStart +
    parts.blockPrefix +
    parts.openTag +
    innerHTML +
    parts.closeTag +
    parts.blockSuffix +
    parts.markerEnd
  );
}
function replaceMarkedFragment(content, id, innerHTML) {
  const parts = extractMarkedFragment(content, id);
  if (!parts) throw new Error(`Fragment markers not found in file: ${id}`);
  return (
    content.slice(0, parts.fullStart) +
    rebuildMarkedFragmentFromParts(parts, innerHTML) +
    content.slice(parts.fullEnd)
  );
}
function validateMarkers(content, path = 'file') {
  const warnings = [];
  const startRe = cmsStartRe();
  const seen = new Set();
  let sm;
  while ((sm = startRe.exec(content))) {
    const markerId = sm[1];
    if (seen.has(markerId)) warnings.push(`${path}: duplicate cms marker id "${markerId}".`);
    seen.add(markerId);
    const afterStart = startRe.lastIndex;
    const rest = content.slice(afterStart);
    const em = markerEndRegex(markerId).exec(rest);
    if (!em) {
      warnings.push(`${path}: cms:start "${markerId}" has no matching cms:end "${markerId}".`);
      continue;
    }
    const block = content.slice(afterStart, afterStart + em.index);
    const first = findFirstElement(block);
    if (!first) {
      warnings.push(`${path}: marker "${markerId}" contains no valid HTML element.`);
      startRe.lastIndex = afterStart + em.index + em[0].length;
      continue;
    }
    const close = findMatchingClose(block, first.tag, first.openEnd + 1);
    if (!close) {
      warnings.push(`${path}: marker "${markerId}" has an unclosed <${first.tag}> element.`);
      startRe.lastIndex = afterStart + em.index + em[0].length;
      continue;
    }
    const dataId = attrGet(first.attrs, 'data-fragment');
    if (dataId && dataId !== markerId)
      warnings.push(`${path}: cms marker "${markerId}" does not match data-fragment="${dataId}".`);
    if (!dataId)
      warnings.push(`${path}: marker "${markerId}" should include data-fragment="${markerId}".`);
    if (!attrGet(first.attrs, 'data-label'))
      warnings.push(
        `${path}: marker "${markerId}" should include data-label for a clearer sidebar label.`
      );
    startRe.lastIndex = afterStart + em.index + em[0].length;
  }
  return warnings;
}

export const FragmentParser = Object.freeze({
  attrGet,
  fragmentIdFromAttrs,
  findMarkedFragments,
  extractMarkedFragment,
  replaceMarkedFragment,
  validateMarkers,
  rebuildMarkedFragmentFromParts,
  attrsDeclareFragment
});
