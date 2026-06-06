export function manifestLabelForFragment(manifest, fragment) {
  if (!fragment) return '';
  const entry = Array.isArray(manifest)
    ? manifest.find(item => item && item.id === fragment.id)
    : null;
  return entry && entry.label ? entry.label : fragment.id;
}

export function isFragmentDirty(fragment, manifest) {
  if (!fragment) return false;
  const htmlDirty = String(fragment.innerHTML ?? '') !== String(fragment.origHTML ?? '');
  const labelDirty = String(fragment.label ?? fragment.id ?? '') !== String(manifestLabelForFragment(manifest, fragment));
  return htmlDirty || labelDirty;
}

export function applyEditorValues(fragment, { html, label }, manifest) {
  if (!fragment) return null;
  const next = {
    ...fragment,
    innerHTML: html,
    label: String(label || fragment.id || '').trim() || fragment.id
  };
  next.dirty = isFragmentDirty(next, manifest);
  return next;
}

export function markCleanAfterSave(fragment) {
  if (!fragment) return null;
  return {
    ...fragment,
    origHTML: fragment.innerHTML,
    dirty: false
  };
}

export function dirtyFragments(fragments) {
  const list = Array.isArray(fragments) ? fragments : [...(fragments || [])];
  return list.filter(fragment => fragment && fragment.dirty);
}

export function dirtyFragmentIdsForFile(fileRec, fragmentMap) {
  if (!fileRec || !Array.isArray(fileRec.fragments)) return [];
  return fileRec.fragments.filter(id => {
    const fragment = fragmentMap instanceof Map ? fragmentMap.get(id) : fragmentMap?.[id];
    return !!(fragment && fragment.dirty);
  });
}
