/* ---------- GitHub API utility helpers ---------- */
const GitHubApiUtils = (() => {
  const GITHUB_API_VERSION = '2022-11-28';

  function encodePathPart(value) {
    return encodeURIComponent(String(value || ''));
  }

  function normalizeApiPath(path = '') {
    const raw = String(path || '');
    return raw.startsWith('/') ? raw : `/${raw}`;
  }

  function repoPath({ owner, repo, path = '' }) {
    return `/repos/${owner}/${repo}${path || ''}`;
  }

  function requestHeaders({ token, hasBody = false }) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      ...(hasBody ? { 'Content-Type': 'application/json' } : {})
    };
  }

  function requestBody(body) {
    return body ? JSON.stringify(body) : undefined;
  }

  function branchPath(branch) {
    return `/branches/${encodePathPart(branch)}`;
  }

  function refPath(branch) {
    return `/git/ref/heads/${encodePathPart(branch)}`;
  }

  function updateRefPath(branch) {
    return `/git/refs/heads/${encodePathPart(branch)}`;
  }

  function createRefBody({ branch, sha }) {
    return {
      ref: `refs/heads/${branch}`,
      sha
    };
  }

  function updateRefBody({ sha, force = false }) {
    return { sha, force };
  }

  function contentsPath({ path, ref, githubPath }) {
    const base = `/contents/${githubPath(path)}`;
    return ref ? `${base}?ref=${encodePathPart(ref)}` : base;
  }

  function commitPath(sha) {
    return `/git/commits/${encodePathPart(sha)}`;
  }

  function treePath(ref, { recursive = false } = {}) {
    return `/git/trees/${encodePathPart(ref)}${recursive ? '?recursive=1' : ''}`;
  }

  function blobPath(sha) {
    return `/git/blobs/${encodePathPart(sha)}`;
  }

  function mergePath() {
    return '/merges';
  }

  function mergeBody({ base, head, commit_message }) {
    return { base, head, commit_message };
  }

  function comparePath({ base, head }) {
    return `/compare/${encodePathPart(base)}...${encodePathPart(head)}`;
  }

  function pagesPath() {
    return '/pages';
  }

  return Object.freeze({
    GITHUB_API_VERSION,
    encodePathPart,
    normalizeApiPath,
    repoPath,
    requestHeaders,
    requestBody,
    branchPath,
    refPath,
    updateRefPath,
    createRefBody,
    updateRefBody,
    contentsPath,
    commitPath,
    treePath,
    blobPath,
    mergePath,
    mergeBody,
    comparePath,
    pagesPath
  });
})();
