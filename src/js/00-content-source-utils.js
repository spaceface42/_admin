/* ---------- content source utility helpers ---------- */
const ContentSourceUtils = (() => {
  function cacheKey({ owner, repo, branch }) {
    return `${owner}/${repo}:${branch}`;
  }

  function repoKeyPrefix({ owner, repo }) {
    return `${owner}/${repo}:`;
  }

  function writeCachedCommit(data, { owner, repo, branch, sha, now }) {
    if (!owner || !repo || !branch || !sha) return { ...(data || {}) };
    return {
      ...(data || {}),
      [cacheKey({ owner, repo, branch })]: {
        sha,
        t: now
      }
    };
  }

  function cachedCommitIfFresh(item, { now, ttlMs }) {
    if (!item || !item.sha) return '';
    if (now - (item.t || 0) > ttlMs) return '';
    return item.sha;
  }

  function clearCachedBranch(data, { owner, repo, branch }) {
    const next = { ...(data || {}) };
    delete next[cacheKey({ owner, repo, branch })];
    return next;
  }

  function clearCachedRepo(data, { owner, repo }) {
    const next = { ...(data || {}) };
    const prefix = repoKeyPrefix({ owner, repo });
    for (const key of Object.keys(next)) {
      if (key.startsWith(prefix)) delete next[key];
    }
    return next;
  }

  function choosePinnedCommit({ branch, workBranch, preferLastWrite = true, cachedSha = '' }) {
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

  function buildContentTreeSnapshot({ branch, commitSha, treeSha, source, treeResponse, treeLoaded = true }) {
    return {
      branch,
      commitSha,
      treeSha,
      source,
      treeLoaded,
      tree: treeResponse && Array.isArray(treeResponse.tree) ? treeResponse.tree : []
    };
  }

  function findBlobInTree(tree, path) {
    return (tree || []).find((item) => item && item.path === path && item.type === 'blob') || null;
  }

  function normalizeBlobContent(content) {
    return String(content || '').replace(/\s+/g, '');
  }

  return Object.freeze({
    cacheKey,
    repoKeyPrefix,
    writeCachedCommit,
    cachedCommitIfFresh,
    clearCachedBranch,
    clearCachedRepo,
    choosePinnedCommit,
    buildContentTreeSnapshot,
    findBlobInTree,
    normalizeBlobContent
  });
})();
