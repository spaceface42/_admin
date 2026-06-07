/* ---------- Store ---------- */
// Depends on state/constants/Paths from 00-core.js.

const Store = Object.freeze({
  setRepo(owner, repo, token) {
    state.owner = owner;
    state.repo = repo;
    state.token = token;
  },
  setDefaultBranch(branch) {
    state.defaultBranch = branch || 'main';
  },
  setWorkBranch(branch) {
    state.workBranch = (branch || DEFAULT_WORK_BRANCH).trim();
  },
  setManifestPath(path) {
    state.manifestPath = Paths.normalizeRepoPath(path) || DEFAULT_MANIFEST_PATH;
  },
  clearLoadedContent() {
    state.files.clear();
    state.frags.clear();
    state.activeId = null;
  },
  setContentTree(snapshot) {
    state.contentTree = snapshot;
  },
  clearContentTree() {
    state.contentTree = null;
  },
  setManifest(manifest) {
    state.manifest = manifest;
  },
  setActiveFragment(id) {
    state.activeId = id;
  },
  addFile(fileRec) {
    state.files.set(fileRec.path, fileRec);
  },
  removeFile(path) {
    state.files.delete(path);
  },
  addFragment(fragment) {
    state.frags.set(fragment.id, fragment);
  },
  manifestLabelForFragment(fragment) {
    return DirtyState.manifestLabelForFragment(state.manifest, fragment);
  },
  isFragmentDirty(fragment) {
    return DirtyState.isFragmentDirty(fragment, state.manifest);
  },
  applyEditorValues(id, { html, label } = {}) {
    const fragment = state.frags.get(id);
    if (!fragment) return null;
    const next = DirtyState.applyEditorValues(fragment, { html, label }, state.manifest);
    Object.assign(fragment, next);
    return fragment;
  },
  markFragmentClean(id) {
    const fragment = state.frags.get(id);
    if (!fragment) return null;
    Object.assign(fragment, DirtyState.markCleanAfterSave(fragment));
    return fragment;
  },
  dirtyFragments() {
    return DirtyState.dirtyFragments(state.frags.values());
  },
  dirtyFragmentIdsForFile(fileRec) {
    return DirtyState.dirtyFragmentIdsForFile(fileRec, state.frags);
  },
  clearValidationBucket(kind) {
    if (state.validation && state.validation[kind]) state.validation[kind] = [];
  },
  resetRuntimeValidation() {
    state.validation.manifest = [];
    state.validation.markers = [];
    state.validation.runtime = [];
  }
});
