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
    if (!fragment) return '';
    const entry = state.manifest && state.manifest.find((e) => e.id === fragment.id);
    return entry && entry.label ? entry.label : fragment.id;
  },
  isFragmentDirty(fragment) {
    if (!fragment) return false;
    return (
      String(fragment.innerHTML || '') !== String(fragment.origHTML || '') ||
      String(fragment.label || fragment.id) !== String(this.manifestLabelForFragment(fragment))
    );
  },
  applyEditorValues(id, { html, label } = {}) {
    const fragment = state.frags.get(id);
    if (!fragment) return null;
    if (html !== undefined) fragment.innerHTML = html;
    if (label !== undefined) fragment.label = String(label).trim() || fragment.id;
    fragment.dirty = this.isFragmentDirty(fragment);
    return fragment;
  },
  markFragmentClean(id) {
    const fragment = state.frags.get(id);
    if (!fragment) return null;
    fragment.origHTML = fragment.innerHTML;
    fragment.dirty = false;
    return fragment;
  },
  dirtyFragments() {
    return [...state.frags.values()].filter((f) => f.dirty);
  },
  dirtyFragmentIdsForFile(fileRec) {
    if (!fileRec || !Array.isArray(fileRec.fragments)) return [];
    return fileRec.fragments.filter((id) => state.frags.get(id)?.dirty);
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
