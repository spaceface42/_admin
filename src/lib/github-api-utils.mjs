export const GITHUB_API_VERSION = '2022-11-28';

export function encodePathPart(value) {
  return encodeURIComponent(String(value || ''));
}

export function normalizeApiPath(path = '') {
  const raw = String(path || '');
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function repoPath({ owner, repo, path = '' }) {
  return `/repos/${owner}/${repo}${path || ''}`;
}

export function requestHeaders({ token, hasBody = false }) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    ...(hasBody ? { 'Content-Type': 'application/json' } : {})
  };
}

export function requestBody(body) {
  return body ? JSON.stringify(body) : undefined;
}

export function branchPath(branch) {
  return `/branches/${encodePathPart(branch)}`;
}

export function refPath(branch) {
  return `/git/ref/heads/${encodePathPart(branch)}`;
}

export function updateRefPath(branch) {
  return `/git/refs/heads/${encodePathPart(branch)}`;
}

export function createRefBody({ branch, sha }) {
  return {
    ref: `refs/heads/${branch}`,
    sha
  };
}

export function updateRefBody({ sha, force = false }) {
  return { sha, force };
}

export function contentsPath({ path, ref, githubPath }) {
  const base = `/contents/${githubPath(path)}`;
  return ref ? `${base}?ref=${encodePathPart(ref)}` : base;
}

export function commitPath(sha) {
  return `/git/commits/${encodePathPart(sha)}`;
}

export function treePath(ref, { recursive = false } = {}) {
  return `/git/trees/${encodePathPart(ref)}${recursive ? '?recursive=1' : ''}`;
}

export function blobPath(sha) {
  return `/git/blobs/${encodePathPart(sha)}`;
}

export function mergePath() {
  return '/merges';
}

export function mergeBody({ base, head, commit_message }) {
  return { base, head, commit_message };
}

export function comparePath({ base, head }) {
  return `/compare/${encodePathPart(base)}...${encodePathPart(head)}`;
}

export function pagesPath() {
  return '/pages';
}
