/* ---------- validation browser wrappers ---------- */
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
  return Validation.validateConfig(cfg, {
    source,
    owner: state.owner,
    repo: state.repo
  });
}

function validateManifestEntries(manifest, source = 'manifest') {
  return Validation.validateManifestEntries(manifest, { source });
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
  const warnings = Validation.validateMarkers(fileRec.content || '', fileRec.path);
  for (const warning of warnings) addValidation('markers', warning);
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
