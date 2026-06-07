/* ---------- path/media wrapper helpers ---------- */
// Thin browser wrappers around Paths/config helpers.
// Kept separate from 00-core.js so core stays focused on constants/state/Store.

function ghPath(path) {
  return Paths.githubPath(path);
}
function normalizeRepoPath(path) {
  return Paths.normalizeRepoPath(path);
}
function defaultPublicPrefixFor(dir) {
  return Paths.defaultPublicPrefixFor(dir);
}
function normalizePublicPrefix(prefix, dir) {
  return Paths.normalizePublicPrefix(prefix, dir);
}
function mediaDir() {
  const m = configMedia();
  return Paths.normalizeRepoPath((m && m.dir) || DEFAULT_MEDIA_DIR);
}
function mediaPrefix() {
  const m = configMedia();
  const raw = (m && m.publicPrefix) || '';
  return Paths.normalizePublicPrefix(raw, mediaDir());
}

function contentAssetRef() {
  return state.contentTree && state.contentTree.commitSha
    ? state.contentTree.commitSha
    : state.workBranch;
}

function previewCssList() {
  const p = gitcmsConfig && gitcmsConfig.preview;
  if (!p || typeof p !== 'object') return [];
  const css = Array.isArray(p.css) ? p.css : typeof p.css === 'string' ? [p.css] : [];
  return css.map((x) => String(x).trim()).filter(Boolean);
}
function publicPathToRepoPath(publicPath) {
  return Paths.publicPathToRepoPath(publicPath);
}
function rawUrlForRepoPath(path) {
  return Paths.rawUrlForRepoPath(path, contentAssetRef());
}
function previewCssTags() {
  if (!state.owner || !state.repo) return '';
  return previewCssList()
    .map((path) => {
      const repoPath = Paths.publicPathToRepoPath(path);
      const href = Paths.rawUrlForRepoPath(repoPath, contentAssetRef()) + '?v=' + Date.now();
      return `<link rel="stylesheet" href="${escAttr(href)}">`;
    })
    .join('\n');
}

function mediaPublicUrl(path) {
  return Paths.mediaPublicUrl(path, mediaPrefix());
}

function mimeFromName(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.svg')) return 'image/svg+xml';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.avif')) return 'image/avif';
  return 'image/jpeg';
}
