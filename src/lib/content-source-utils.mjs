export function cacheKey({ owner, repo, branch }) {
  return `${owner}/${repo}:${branch}`;
}

export function repoKeyPrefix({ owner, repo }) {
  return `${owner}/${repo}:`;
}

export function writeCachedCommit(data, { owner, repo, branch, sha, now }) {
  if (!owner || !repo || !branch || !sha) return { ...(data || {}) };
  return {
    ...(data || {}),
    [cacheKey({ owner, repo, branch })]: {
      sha,
      t: now
    }
  };
}

export function cachedCommitIfFresh(item, { now, ttlMs }) {
  if (!item || !item.sha) return '';
  if (now - (item.t || 0) > ttlMs) return '';
  return item.sha;
}

export function clearCachedBranch(data, { owner, repo, branch }) {
  const next = { ...(data || {}) };
  delete next[cacheKey({ owner, repo, branch })];
  return next;
}

export function clearCachedRepo(data, { owner, repo }) {
  const next = { ...(data || {}) };
  const prefix = repoKeyPrefix({ owner, repo });
  for (const key of Object.keys(next)) {
    if (key.startsWith(prefix)) delete next[key];
  }
  return next;
}

export function choosePinnedCommit({ branch, workBranch, preferLastWrite = true, cachedSha = '' }) {
  if (preferLastWrite && branch === workBranch && cachedSha) {
    return {
      commitSha: cachedSha,
      source: 'last successful write'
    };
  }

  return {
    commitSha: '',
    source: 'branch ref'
  };
}

export function buildContentTreeSnapshot({ branch, commitSha, treeSha, source, treeResponse }) {
  return {
    branch,
    commitSha,
    treeSha,
    source,
    tree: treeResponse && Array.isArray(treeResponse.tree) ? treeResponse.tree : []
  };
}

export function findBlobInTree(tree, path) {
  return (tree || []).find((item) => item && item.path === path && item.type === 'blob') || null;
}

export function normalizeBlobContent(content) {
  return String(content || '').replace(/\s+/g, '');
}

export function chooseReadCommitFromCacheValidation({ branchSha, cachedSha, cacheAheadBy }) {
  if (!branchSha) {
    return { commitSha: '', source: 'branch ref' };
  }

  if (!cachedSha || cachedSha === branchSha) {
    return {
      commitSha: branchSha,
      source: cachedSha ? 'branch ref + cached write' : 'branch ref'
    };
  }

  if (typeof cacheAheadBy === 'number' && cacheAheadBy > 0) {
    return {
      commitSha: cachedSha,
      source: 'last successful write'
    };
  }

  return {
    commitSha: branchSha,
    source: 'branch ref'
  };
}
