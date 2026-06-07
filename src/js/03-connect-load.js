/* ---------- connect / load ---------- */
async function connect() {
  const url = el('repoUrl').value,
    tok = el('token').value.trim();
  const parsed = parseRepoUrl(url);
  el('loginErr').style.display = 'none';
  const validationMsg = ConnectUtils.connectValidation({ repoUrl: url, token: tok });
  if (validationMsg) {
    showLoginErr(validationMsg);
    return;
  }

  Store.setRepo(parsed.owner, parsed.repo, tok);
  const btn = el('connectBtn');
  btn.disabled = true;
  btn.textContent = 'Connecting…';

  try {
    // resolve default branch
    const repoInfo = await GitHubApi.getRepo();
    Store.setDefaultBranch(repoInfo.default_branch || 'main');

    // Load config from main FIRST so we know workBranch and manifestPath before
    // ensureWorkBranch() or any branch operations.
    const cfg = await loadGitCMSConfig(true, [state.defaultBranch]);
    applyConfig(cfg);

    // ensure content/work branch exists
    await ensureWorkBranch();

    // From here on, content/work branch is the only CMS source tree.
    Store.clearContentTree();
    await GitHubApi.getBranchTreeSnapshot(state.workBranch, { force: true });

    const branchCfg = await loadGitCMSConfig(true, [state.workBranch]);
    applyConfig(branchCfg);

    // persist creds
    localStorage.setItem(LS_REPO, url.trim());
    localStorage.setItem(LS_TOKEN, enc(tok));

    el('login').style.display = 'none';
    el('app').style.display = 'flex';
    el('repoBadgeTxt').textContent = `${state.owner}/${state.repo}`;
    el('repoBadge').title = 'Content/site repository: ' + `${state.owner}/${state.repo}`;
    updateBranchLabels();
    renderEditorSnippetControls();

    await loadAll();
  } catch (e) {
    showLoginErr(loginErrMsg(e));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Connect';
  }
}

/* Apply workBranch and manifestPath from loaded config into state. */
function applyConfig(cfg) {
  const patch = ConnectUtils.configStatePatch(cfg);
  if (patch.workBranch) Store.setWorkBranch(patch.workBranch);
  if (patch.manifestPath) Store.setManifestPath(patch.manifestPath);
}

/* Update all branch-name labels in the UI after connect or config save. */
function branchLabel(name) {
  return ConnectUtils.branchLabel(name);
}
function updateBranchLabels() {
  el('workBranchBadge').textContent = state.workBranch;
  el('publishTargetTxt').textContent = state.defaultBranch;
  const saveBtn = el('saveBtn');
  if (saveBtn) saveBtn.textContent = `Save → ${branchLabel(state.workBranch)}`;
  const resetBtn = el('resetDraftBtn');
  if (resetBtn) resetBtn.textContent = `Reset ${state.workBranch} from ${state.defaultBranch}`;
  const commitTitle = document.querySelector('#commitModal h3');
  if (commitTitle) commitTitle.textContent = `Commit to ${state.workBranch}`;
  const settingsNote = el('settingsWorkBranchNote');
  if (settingsNote) settingsNote.textContent = state.workBranch;
  const cfgBranch = el('cfgWorkBranch');
  if (cfgBranch) cfgBranch.textContent = state.workBranch;
  const mediaNote = el('mediaBranchNote');
  if (mediaNote) mediaNote.textContent = state.workBranch;
  const pubTitle = document.querySelector('#pubModal h3');
  if (pubTitle) pubTitle.textContent = `Publish to ${state.defaultBranch}`;
  const pubDesc = document.querySelector('#pubModal .mdesc');
  if (pubDesc) {
    pubDesc.innerHTML = `Deploy <b>${esc(state.workBranch)}</b> to <b>${esc(state.defaultBranch)}</b>. The GitHub Action will deploy <span class="mono">docs/</span> to Pages.`;
  }
}

function loginErrMsg(e) {
  if (e.status === 401) return 'Authentication failed — check the token.';
  if (e.status === 404) return 'Repo not found, or the token lacks access to it.';
  return 'Connection failed: ' + e.message;
}
function showLoginErr(m) {
  const x = el('loginErr');
  x.textContent = m;
  x.style.display = 'block';
}

async function ensureWorkBranch() {
  try {
    await GitHubApi.getBranch(state.workBranch);
    return;
  } catch (e) {
    if (e.status !== 404) throw e;
  }

  // If this repo already used the old "draft" branch, seed the new content
  // branch from it so unpublished CMS work is not lost during the rename.
  let sourceBranch = state.defaultBranch;
  if (state.workBranch !== LEGACY_WORK_BRANCH) {
    try {
      await GitHubApi.getBranch(LEGACY_WORK_BRANCH);
      sourceBranch = LEGACY_WORK_BRANCH;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }

  const ref = await GitHubApi.getRef(sourceBranch);
  await GitHubApi.createBranchFromSha(state.workBranch, ref.object.sha);
  toast(`Created ${state.workBranch} branch from ${sourceBranch}`, 'ok');
}

/* FIX #2 + hardening: read the manifest from BOTH branches.
   Returns the work-branch manifest if present, with default-branch fallback. */
async function loadManifest() {
  async function read(ref) {
    try {
      const r = await GitHubApi.getFile(state.manifestPath, ref);
      let parsed = null;
      try {
        parsed = JSON.parse(dec(r.content));
      } catch (parseErr) {
        addValidation(
          'manifest',
          `${state.manifestPath} on ${ref}: invalid JSON — ${parseErr.message}`
        );
        return null;
      }
      state.validation.manifest.push(
        ...validateManifestEntries(parsed, `${state.manifestPath} on ${ref}`)
      );
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  // Strict CMS source of truth: content/work branch only.
  // Do not silently load fragments from main/default, because that can show stale
  // live content in the admin after saves or publish operations.
  const workMan = await read(state.workBranch);
  return { workMan, defaultMan: null };
}

async function fetchFile(path) {
  try {
    const r = await GitHubApi.getFile(path, state.workBranch);
    return {
      path,
      content: dec(r.content),
      src: state.workBranch,
      shaMain: null,
      shaDraft: r.sha,
      fragments: []
    };
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function loadAll() {
  resetLoadValidation();
  setStatus('Loading…', true);
  Store.clearLoadedContent();
  Store.clearContentTree();
  await GitHubApi.getBranchTreeSnapshot(state.workBranch, { force: true });
  el('banner').classList.remove('show');
  el('divergeBanner').classList.remove('show');

  try {
    const { workMan, defaultMan } = await loadManifest();

    // Strict source of truth: load only from the content/work branch.
    // Never fall back to main/default for editable source files.
    let used = null;
    if (workMan) {
      const result = await tryLoadFromManifest(workMan);
      if (result.count > 0) {
        used = { manifest: workMan, from: state.workBranch };
      } else {
        state.files.clear();
        state.frags.clear();
      }
    }

    if (!used) {
      // No manifest worked (or none existed) → full tree scan from work branch.
      await tryTreeScan();
      if (state.frags.size === 0 && (workMan || defaultMan)) {
        // Manifest(s) existed but matched nothing anywhere.
        setStatus('Manifest matched no fragments', false);
        toast(
          `Manifest found on ${state.workBranch}, but no matching fragments in content files`,
          'err'
        );
      } else if (!workMan && !defaultMan) {
        el('banner').classList.add('show'); // genuine no-manifest case
      }
      state.manifest = defaultMan || workMan || buildManifestFromState();
    } else {
      state.manifest = used.manifest;
      // Re-apply labels from the chosen manifest now that frags exist.
      relabelFromManifest(state.manifest);
    }

    validateManifestMatchesLoaded(state.manifest, state.manifestPath);

    // drop files with no fragments
    for (const [p, r] of [...state.files]) if (!r.fragments.length) state.files.delete(p);

    renderTree();
    const n = state.frags.size;
    const warnCount = validationCount();
    setStatus(
      `${n} fragment${n === 1 ? '' : 's'} loaded${warnCount ? ` · ${warnCount} warning${warnCount === 1 ? '' : 's'}` : ''}`,
      false
    );
    el('sbCount').textContent =
      `${n} fragment${n === 1 ? '' : 's'}${warnCount ? ` · ${warnCount} warning${warnCount === 1 ? '' : 's'}` : ''}`;
    if (warnCount)
      toast(
        `${warnCount} validation warning${warnCount === 1 ? '' : 's'} — open Diagnostics`,
        'err'
      );
    showEmpty();
  } catch (e) {
    setStatus('Load failed', false);
    toast(GitHubErrors.githubErrorMessage(e, { action: 'Load' }), 'err');
    console.error(e);
  }
}

/* Load files referenced by a manifest; returns {count}. Does NOT clear state. */
async function tryLoadFromManifest(manifest) {
  state.manifest = manifest; // so parseFileFragments can read labels
  const paths = [...new Set(manifest.map((e) => e.file))];
  const recs = await Promise.all(
    paths.map((p) =>
      fetchFile(p).catch((e) => {
        console.warn('fetch skip', p, e);
        return null;
      })
    )
  );
  for (const r of recs) {
    if (!r) continue;
    state.files.set(r.path, r);
    parseFileFragments(r);
  }
  // Only count fragments whose id appears in this manifest — guards against a
  // stale manifest that points at the right files but wrong ids.
  const manIds = new Set(manifest.map((e) => e.id));
  let count = 0;
  for (const f of state.frags.values()) if (manIds.has(f.id)) count++;
  return { count };
}

async function tryTreeScan() {
  state.manifest = null;

  const snapshot = await GitHubApi.getBranchTreeSnapshot(state.workBranch);
  const paths = (snapshot.tree || [])
    .filter((n) => n.type === 'blob' && /\.html?$/i.test(n.path))
    .map((n) => n.path);

  const recs = await Promise.all(
    paths.map((p) =>
      fetchFile(p).catch((e) => {
        console.warn('scan skip', p, e);
        return null;
      })
    )
  );
  for (const r of recs) {
    if (!r) continue;
    state.files.set(r.path, r);
    parseFileFragments(r);
  }
}

function relabelFromManifest(manifest) {
  if (!manifest) return;
  for (const e of manifest) {
    const f = state.frags.get(e.id);
    if (f) f.label = e.label;
  }
}
function buildManifestFromState() {
  return [...state.frags.values()].map((f) => ({ id: f.id, file: f.path, label: f.label }));
}
