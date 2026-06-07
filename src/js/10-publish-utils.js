/* ---------- publish utility helpers ---------- */
const PublishUtils = (() => {
  function statusLabel(status) {
    if (status === 'added') return 'added';
    if (status === 'removed') return 'deleted';
    if (status === 'renamed') return 'renamed';
    if (status === 'modified') return 'modified';
    return status || 'changed';
  }

  function displayFilePath(file) {
    if (!file) return '';
    return file.status === 'renamed' && file.previous_filename
      ? `${file.previous_filename} → ${file.filename}`
      : file.filename || '';
  }

  function summarizeCompare(compare, { limit = 40 } = {}) {
    const files = compare && Array.isArray(compare.files) ? compare.files : [];
    const ahead = compare && typeof compare.ahead_by === 'number' ? compare.ahead_by : null;
    const total = files.length;
    const shown = files.slice(0, limit).map((file) => ({
      status: file.status || 'changed',
      label: statusLabel(file.status),
      path: displayFilePath(file)
    }));

    return {
      hasCompare: !!compare,
      total,
      ahead,
      nothingToPublish: !!compare && total === 0 && ahead === 0,
      shown,
      moreCount: Math.max(0, total - shown.length),
      hasCommitsWithoutFileList: !!compare && total === 0 && ahead !== 0
    };
  }

  function canPublishCompare(compare) {
    const summary = summarizeCompare(compare);
    if (!summary.hasCompare) return false;
    if (summary.nothingToPublish) return false;

    // Prefer ahead_by when GitHub returns it. A branch with 0 ahead commits should
    // not be published again even if an old/stale file list is still present.
    if (summary.ahead !== null) return summary.ahead > 0;

    return summary.total > 0;
  }

  function publishBlockedReason(compare) {
    const summary = summarizeCompare(compare);
    if (!summary.hasCompare) return 'Changed files could not be loaded. Refresh and try again.';
    if (!canPublishCompare(compare))
      return 'Nothing to publish. The content branch is already up to date with the live branch.';
    return '';
  }

  function compareUrl({ owner, repo, base, head }) {
    return `https://github.com/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
  }

  function publishConflictInfo(error, { owner, repo, base, head, workBranch, defaultBranch }) {
    if (!error || error.status !== 409) return null;

    const url = compareUrl({ owner, repo, base, head });
    if (error.phase === 'sync-main-into-work') {
      return {
        kind: 'sync-conflict',
        url,
        message: `${workBranch} and ${defaultBranch} both changed the same file/lines, so GitCMS could not auto-sync before publishing.`
      };
    }

    return {
      kind: 'publish-conflict',
      url,
      message: `Merge conflict while publishing ${workBranch} → ${defaultBranch}.`
    };
  }

  function mergeResultSha(result) {
    if (!result) return '';
    if (typeof result.sha === 'string' && result.sha) return result.sha;
    if (result.commit && typeof result.commit.sha === 'string' && result.commit.sha)
      return result.commit.sha;
    if (result.object && typeof result.object.sha === 'string' && result.object.sha)
      return result.object.sha;
    return '';
  }

  function alignedCompareSummary() {
    return {
      files: [],
      ahead_by: 0
    };
  }

  function refSha(ref) {
    return ref && ref.object && typeof ref.object.sha === 'string' ? ref.object.sha : '';
  }

  function refsPointToSameSha(baseRef, headRef) {
    const baseSha = refSha(baseRef);
    const headSha = refSha(headRef);
    return !!(baseSha && headSha && baseSha === headSha);
  }

  function effectiveHeadSha({ headRef, pinnedSha }) {
    return pinnedSha || refSha(headRef);
  }

  function refsOrPinnedPointToSameSha({ baseRef, headRef, pinnedHeadSha }) {
    const baseSha = refSha(baseRef);
    const headSha = effectiveHeadSha({ headRef, pinnedSha: pinnedHeadSha });
    return !!(baseSha && headSha && baseSha === headSha);
  }

  function effectivePublishSha({ headRef, pinnedHeadSha }) {
    return effectiveHeadSha({ headRef, pinnedSha: pinnedHeadSha });
  }

  function effectiveBaseSha({ baseRef, pinnedSha }) {
    return pinnedSha || refSha(baseRef);
  }

  function refsOrPinnedBranchesAligned({ baseRef, headRef, pinnedBaseSha, pinnedHeadSha }) {
    const baseSha = effectiveBaseSha({ baseRef, pinnedSha: pinnedBaseSha });
    const headSha = effectiveHeadSha({ headRef, pinnedSha: pinnedHeadSha });
    return !!(baseSha && headSha && baseSha === headSha);
  }

  return Object.freeze({
    statusLabel,
    displayFilePath,
    summarizeCompare,
    canPublishCompare,
    publishBlockedReason,
    compareUrl,
    publishConflictInfo,
    mergeResultSha,
    alignedCompareSummary,
    refSha,
    refsPointToSameSha,
    effectiveHeadSha,
    refsOrPinnedPointToSameSha,
    effectivePublishSha,
    effectiveBaseSha,
    refsOrPinnedBranchesAligned
  });
})();
