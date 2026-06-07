/* ---------- fragment parsing ---------- */
/*
  Fragment format:

    <!-- cms:start hero -->
    <section data-fragment="hero" data-label="Hero Section" class="hero">
      ...
    </section>
    <!-- cms:end hero -->

  The comments define the safe replacement boundary.
  data-fragment/data-label describe the editable fragment.

  Parser source of truth:
  Marker parsing and parser helpers live in src/lib/fragment-parser.mjs and are
  generated into the browser as FragmentParser.
*/

function fragmentLabelFor(id, attrs) {
  const manEntry = state.manifest && state.manifest.find((e) => e.id === id);
  return manEntry ? manEntry.label : FragmentParser.attrGet(attrs, 'data-label') || id;
}

function rebuildFragment(f) {
  return `${f.openTag}${f.innerHTML}${f.closeTag}`;
}

/* Parse a file's content into fragment objects, registering them on
   the canonical file record. */
function parseFileFragments(fileRec) {
  validateMarkersInFile(fileRec);
  const ids = [];
  const seen = new Set();

  // Preferred parser: explicit cms:start/cms:end boundaries.
  for (const frag of FragmentParser.findMarkedFragments(fileRec.content)) {
    const id = frag.id;
    if (seen.has(id)) continue;
    seen.add(id);

    const f = {
      id,
      markerId: frag.markerId,
      mode: 'marker',
      classes: FragmentParser.attrGet(frag.attrs, 'class'),
      label: fragmentLabelFor(id, frag.attrs),
      path: fileRec.path,
      file: fileRec.path.split('/').pop(),
      openTag: frag.openTag,
      closeTag: frag.closeTag,
      innerHTML: frag.innerHTML,
      origHTML: frag.innerHTML,
      dirty: false
    };
    state.frags.set(id, f);
    ids.push(id);
  }

  fileRec.fragments = ids;
  return ids;
}
