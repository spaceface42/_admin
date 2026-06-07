/* ---------- config/settings ---------- */
let gitcmsConfig = null;
let gitcmsConfigLoaded = false;
async function loadGitCMSConfig(force = false, refs = null) {
  if (gitcmsConfigLoaded && !force) return gitcmsConfig;
  gitcmsConfigLoaded = true;
  gitcmsConfig = null;
  state.validation.config = [];

  const refsToTry = refs || [state.workBranch, state.defaultBranch];
  for (const ref of refsToTry) {
    try {
      const r = await GitHubApi.getContent(CONFIG_PATH, ref);
      let parsed = null;
      try {
        parsed = JSON.parse(dec(r.content));
      } catch (parseErr) {
        addValidation('config', `${CONFIG_PATH} on ${ref}: invalid JSON — ${parseErr.message}`);
        return null;
      }

      gitcmsConfig = parsed;
      state.validation.config.push(...validateGitCMSConfig(parsed, `${CONFIG_PATH} on ${ref}`));
      return gitcmsConfig;
    } catch (e) {
      if (e.status === 404) continue;
      addValidation('config', `${CONFIG_PATH}: config load failed — ${e.message}`);
      console.warn('config load failed', e);
      return null;
    }
  }

  state.validation.config.push(...validateGitCMSConfig(null, CONFIG_PATH));
  return null;
}

function configMedia() {
  const media = gitcmsConfig && gitcmsConfig.media;
  return media && typeof media === 'object' ? media : null;
}

function updateMediaDirNote() {
  const dir = mediaDir();
  el('mediaDirNote').innerHTML =
    `Folder: <span class="mono">${esc(dir)}</span> — <button class="tbtn ghost" style="padding:2px 6px;font-size:11px;display:inline-flex" onclick="el('mediaModal').classList.remove('show');openSettings()">change in Settings</button>`;
  el('mediaBranchNote').textContent = state.workBranch;
}

function openSettings() {
  const cfg = gitcmsConfig || {};
  const media = cfg.media && typeof cfg.media === 'object' ? cfg.media : {};
  el('cfgWorkBranch').textContent = state.workBranch;
  el('settingsWorkBranchNote').textContent = state.workBranch;
  el('cfgManifestPath').value = state.manifestPath || DEFAULT_MANIFEST_PATH;
  el('cfgMediaDir').value = media.dir || DEFAULT_MEDIA_DIR;
  el('cfgMediaPrefix').value =
    media.publicPrefix || defaultPublicPrefixFor(normalizeRepoPath(media.dir || DEFAULT_MEDIA_DIR));
  el('cfgPreviewCss').value = previewCssList().join(', ');
  el('settingsErr').classList.remove('show');
  el('settingsModal').classList.add('show');
  el('cfgManifestPath').focus();
}

async function saveConfig() {
  const newManifestPath = normalizeRepoPath(el('cfgManifestPath').value) || DEFAULT_MANIFEST_PATH;
  const newMediaDir = normalizeRepoPath(el('cfgMediaDir').value) || DEFAULT_MEDIA_DIR;
  const newMediaPrefix = normalizePublicPrefix(el('cfgMediaPrefix').value, newMediaDir);
  const newPreviewCss = ConfigUtils.parsePreviewCssInput(el('cfgPreviewCss').value);
  el('settingsErr').classList.remove('show');

  const btn = el('settingsSave');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const existing = (await loadGitCMSConfig(true, [state.workBranch])) || {};
    const next = ConfigUtils.buildNextGitCMSConfig(existing, {
      manifestPath: newManifestPath,
      mediaDir: newMediaDir,
      mediaPrefix: newMediaPrefix,
      previewCss: newPreviewCss,
      workBranch: state.workBranch,
      defaultWorkBranch: DEFAULT_WORK_BRANCH
    });

    let sha = null;
    try {
      const cur = await GitHubApi.getFileForWrite(CONFIG_PATH, state.workBranch);
      sha = cur.sha;
    } catch (e) {
      if (e.status !== 404) throw e;
    }

    await GitHubApi.saveFile(CONFIG_PATH, {
      message: 'cms: update GitCMS config',
      content: enc(JSON.stringify(next, null, 2) + '\n'),
      branch: state.workBranch,
      sha
    });
    Store.clearContentTree();

    const manifestChanged = newManifestPath !== state.manifestPath;
    gitcmsConfig = next;
    gitcmsConfigLoaded = true;
    state.manifestPath = newManifestPath;
    updateBranchLabels();
    renderEditorSnippetControls();
    updateMediaDirNote();

    el('settingsModal').classList.remove('show');
    toast('Config saved to ' + state.workBranch, 'ok');

    // Reload if manifest path changed — fragments source has moved.
    if (manifestChanged) await loadAll();
  } catch (e) {
    el('settingsErr').textContent = GitHubErrors.githubErrorMessage(e, { action: 'Save config' });
    el('settingsErr').classList.add('show');
    toast('Config save failed', 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save config';
  }
}

el('settingsBtn').onclick = openSettings;
el('settingsClose').onclick = () => el('settingsModal').classList.remove('show');
el('settingsSave').onclick = saveConfig;
