/* ---------- Paths ---------- */
// Depends on state from 00-core.js and mediaPrefix() from 02-path-media-wrappers.js
// only when mediaPublicUrl() is called without an explicit prefix.

const Paths = Object.freeze({
  githubPath(path) {
    return String(path || '')
      .split('/')
      .map(encodeURIComponent)
      .join('/');
  },
  normalizeRepoPath(path) {
    return (path || '')
      .trim()
      .replace(/^\/+|\/+$/g, '')
      .replace(/\/+/g, '/');
  },
  defaultPublicPrefixFor(dir) {
    const clean = this.normalizeRepoPath(dir).replace(/^docs\//, '');
    return clean.replace(/\/?$/, '/');
  },
  normalizePublicPrefix(prefix, dir) {
    let raw = (prefix || '').trim() || this.defaultPublicPrefixFor(dir);
    if (raw.includes('{path}') || raw.includes('{file}')) return raw;
    return raw.replace(/\/?$/, '/');
  },
  isProjectPagesSite(owner = state.owner, repo = state.repo) {
    return !!(owner && repo && repo.toLowerCase() !== `${owner.toLowerCase()}.github.io`);
  },
  normalizePathParts(path) {
    const parts = [];
    for (const part of String(path || '').split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') parts.pop();
      else parts.push(part);
    }
    return parts.join('/');
  },
  publicPathToRepoPath(publicPath) {
    const clean = this.normalizeRepoPath(publicPath);
    if (!clean) return '';
    if (clean.startsWith('docs/')) return clean;
    return 'docs/' + clean;
  },
  mediaPublicUrl(repoPath, prefix = mediaPrefix()) {
    const file = String(repoPath || '')
      .split('/')
      .pop();
    if (prefix.includes('{path}')) return prefix.replace('{path}', repoPath);
    if (prefix.includes('{file}')) return prefix.replace('{file}', file);
    return prefix.replace(/\/?$/, '/') + file;
  },
  rawUrlForRepoPath(path, ref = state.workBranch) {
    const encoded = this.normalizeRepoPath(path).split('/').map(encodeURIComponent).join('/');
    return `https://raw.githubusercontent.com/${state.owner}/${state.repo}/${encodeURIComponent(ref)}/${encoded}`;
  }
});
