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

  Parser source of truth:
  Marker parsing and parser helpers live in src/lib/fragment-parser.mjs and are
  generated into the browser as FragmentParser.
*/
const SECTION_RE = /(<section\s([^>]*)>)([\s\S]*?)<\/section>/gi;

function fragmentLabelFor(id, attrs) {
  const manEntry = state.manifest && state.manifest.find((e) => e.id === id);
  return manEntry ? manEntry.label : FragmentParser.attrGet(attrs, 'data-label') || id;
}

function rebuildFragment(f) {
  return `${f.openTag}${f.innerHTML}${f.closeTag || '</section>'}`;
}

/* Parse a file's content into fragment objects, registering them on
   the canonical file record. Marker fragments are preferred; old section
   fragments remain supported as fallback. */
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

  // Backward-compatible parser: <section class="fragment"> or data-fragment.
  SECTION_RE.lastIndex = 0;
  let m;
  while ((m = SECTION_RE.exec(fileRec.content))) {
    const openTag = m[1];
    const attrs = m[2];
    if (!FragmentParser.attrsDeclareFragment(attrs)) continue;

    const id = FragmentParser.fragmentIdFromAttrs(attrs);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const inner = m[3];
    const f = {
      id,
      markerId: null,
      mode: 'section',
      classes: FragmentParser.attrGet(attrs, 'class'),
      label: fragmentLabelFor(id, attrs),
      path: fileRec.path,
      file: fileRec.path.split('/').pop(),
      openTag,
      closeTag: '</section>',
      innerHTML: inner,
      origHTML: inner,
      dirty: false
    };
    state.frags.set(id, f);
    ids.push(id);
  }

  fileRec.fragments = ids;
  return ids;
}
