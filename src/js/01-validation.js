/* ---------- validation ---------- */
function validationCount() {
  const v = state.validation || {};
  return ['config', 'manifest', 'markers', 'runtime'].reduce(
    (sum, k) => sum + (v[k] || []).length,
    0
  );
}
function resetLoadValidation() {
  state.validation.manifest = [];
  state.validation.markers = [];
  state.validation.runtime = [];
}
function addValidation(kind, msg) {
  if (!state.validation[kind]) state.validation[kind] = [];
  if (!state.validation[kind].includes(msg)) state.validation[kind].push(msg);
}
function allValidationWarnings() {
  const v = state.validation || {};
  const out = [];
  for (const [kind, items] of Object.entries(v)) {
    for (const msg of items || []) out.push({ kind, msg });
  }
  return out;
}
function validateGitCMSConfig(cfg, source = 'config') {
  const warnings = [];
  const add = (m) => warnings.push(`${source}: ${m}`);

  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    add('gitcms.config.json was not found or is not a JSON object.');
    return warnings;
  }

  if (typeof cfg.workBranch !== 'string' || !cfg.workBranch.trim()) {
    add('missing "workBranch". Recommended value: "content".');
  }
  if (typeof cfg.manifestPath !== 'string' || !cfg.manifestPath.trim()) {
    add('missing "manifestPath". Recommended value: "fragments.json".');
  }

  if (!cfg.media || typeof cfg.media !== 'object' || Array.isArray(cfg.media)) {
    add('missing "media" object.');
  } else {
    if (typeof cfg.media.dir !== 'string' || !cfg.media.dir.trim()) {
      add('missing "media.dir". Recommended for docs publishing: "docs/assets/media".');
    }
    if (typeof cfg.media.publicPrefix !== 'string' || !cfg.media.publicPrefix.trim()) {
      add(
        'missing "media.publicPrefix". Recommended for GitHub Pages project sites: "assets/media/".'
      );
    } else {
      const prefix = cfg.media.publicPrefix.trim();
      const isProjectSite =
        state.owner &&
        state.repo &&
        state.repo.toLowerCase() !== `${state.owner.toLowerCase()}.github.io`;
      if (prefix.startsWith('/') && isProjectSite) {
        add(
          `media.publicPrefix starts with "/". For GitHub Pages project sites, use a relative prefix like "assets/media/".`
        );
      }
    }
  }

  if (cfg.preview !== undefined) {
    if (!cfg.preview || typeof cfg.preview !== 'object' || Array.isArray(cfg.preview)) {
      add('"preview" must be an object if provided.');
    } else if (cfg.preview.css !== undefined) {
      const css = Array.isArray(cfg.preview.css)
        ? cfg.preview.css
        : typeof cfg.preview.css === 'string'
          ? [cfg.preview.css]
          : null;
      if (!css) {
        add('"preview.css" must be a string or an array of strings.');
      } else {
        css.forEach((p, i) => {
          if (typeof p !== 'string' || !p.trim())
            add(`preview.css entry ${i + 1} must be a non-empty string.`);
          if (typeof p === 'string' && p.trim().startsWith('/')) {
            add(
              `preview.css entry "${p}" starts with "/". For GitHub Pages project sites, use relative paths like "assets/style.css".`
            );
          }
        });
      }
    }
  }

  return warnings;
}
function validateManifestEntries(manifest, source = 'manifest') {
  const warnings = [];
  const add = (m) => warnings.push(`${source}: ${m}`);

  if (!Array.isArray(manifest)) {
    add('fragments manifest must be a JSON array.');
    return warnings;
  }

  const seen = new Set();
  manifest.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      add(`entry ${i + 1} must be an object.`);
      return;
    }

    const id = String(entry.id || '').trim();
    const file = String(entry.file || '').trim();
    const label = String(entry.label || '').trim();

    if (!id) add(`entry ${i + 1} is missing "id".`);
    if (!file) add(`entry ${i + 1} (${id || 'no id'}) is missing "file".`);
    if (!label) add(`entry ${i + 1} (${id || 'no id'}) is missing "label".`);
    if (id && seen.has(id)) add(`duplicate fragment id "${id}".`);
    if (id) seen.add(id);
    if (file.startsWith('/'))
      add(
        `fragment "${id}" uses an absolute file path "${file}". Use repo-relative paths like "docs/index.html".`
      );
  });

  return warnings;
}
function validateManifestMatchesLoaded(manifest, source = 'manifest') {
  if (!Array.isArray(manifest)) return;
  for (const entry of manifest) {
    if (!entry || !entry.id || !entry.file) continue;
    const f = state.frags.get(entry.id);
    if (!f) {
      addValidation(
        'manifest',
        `${source}: fragment "${entry.id}" is listed for "${entry.file}" but was not found in loaded HTML.`
      );
    } else if (f.path !== entry.file) {
      addValidation(
        'manifest',
        `${source}: fragment "${entry.id}" loaded from "${f.path}", but manifest says "${entry.file}".`
      );
    }
  }
}
function validateMarkersInFile(fileRec) {
  const content = fileRec.content || '';
  const startRe = cmsStartRe();
  const seen = new Set();
  let sm;

  while ((sm = startRe.exec(content))) {
    const markerId = sm[1];
    if (seen.has(markerId)) {
      addValidation('markers', `${fileRec.path}: duplicate cms marker id "${markerId}".`);
    }
    seen.add(markerId);

    const afterStart = startRe.lastIndex;
    const rest = content.slice(afterStart);
    const endRe = markerEndRegex(markerId);
    const em = endRe.exec(rest);

    if (!em) {
      addValidation(
        'markers',
        `${fileRec.path}: cms:start "${markerId}" has no matching cms:end "${markerId}".`
      );
      continue;
    }

    const block = content.slice(afterStart, afterStart + em.index);
    const first = findFirstElement(block);
    if (!first) {
      addValidation(
        'markers',
        `${fileRec.path}: marker "${markerId}" contains no valid HTML element.`
      );
      startRe.lastIndex = afterStart + em.index + em[0].length;
      continue;
    }

    const close = findMatchingClose(block, first.tag, first.openEnd + 1);
    if (!close) {
      addValidation(
        'markers',
        `${fileRec.path}: marker "${markerId}" has an unclosed <${first.tag}> element.`
      );
      startRe.lastIndex = afterStart + em.index + em[0].length;
      continue;
    }

    const dataId = attrGet(first.attrs, 'data-fragment');
    if (dataId && dataId !== markerId) {
      addValidation(
        'markers',
        `${fileRec.path}: cms marker "${markerId}" does not match data-fragment="${dataId}".`
      );
    }
    if (!dataId) {
      addValidation(
        'markers',
        `${fileRec.path}: marker "${markerId}" should include data-fragment="${markerId}".`
      );
    }
    if (!attrGet(first.attrs, 'data-label')) {
      addValidation(
        'markers',
        `${fileRec.path}: marker "${markerId}" should include data-label for a clearer sidebar label.`
      );
    }

    startRe.lastIndex = afterStart + em.index + em[0].length;
  }
}
function renderValidationBox() {
  const box = el('validationBox');
  if (!box) return;
  const warnings = allValidationWarnings();

  if (!warnings.length) {
    box.classList.remove('show');
    box.innerHTML = '';
    return;
  }

  const rows = warnings
    .slice(0, 20)
    .map((w) => `<li><span class="mono">${esc(w.kind)}</span>: ${esc(w.msg)}</li>`)
    .join('');
  const more =
    warnings.length > 20
      ? `<li>…and ${warnings.length - 20} more warning${warnings.length - 20 === 1 ? '' : 's'}</li>`
      : '';
  box.innerHTML = `<b>${warnings.length} validation warning${warnings.length === 1 ? '' : 's'}</b><ul>${rows}${more}</ul>`;
  box.classList.add('show');
}

const Validation = Object.freeze({
  count: validationCount,
  resetLoad: resetLoadValidation,
  add: addValidation,
  all: allValidationWarnings,
  validateConfig: validateGitCMSConfig,
  validateManifestEntries,
  validateManifestMatchesLoaded,
  validateMarkersInFile,
  renderBox: renderValidationBox
});
