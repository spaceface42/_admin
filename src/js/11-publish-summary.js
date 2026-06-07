/* ---------- publish summary ---------- */
let lastPublishCompare = null;

function setPublishConfirmState(compare) {
  const btn = el('pubConfirm');
  if (!btn) return;
  const blocked = PublishUtils.publishBlockedReason(compare);
  btn.disabled = !!blocked;
  btn.title = blocked;
}

function renderPublishSummary(compare) {
  lastPublishCompare = compare;
  setPublishConfirmState(compare);
  const box = el('pubSummary');
  const summary = PublishUtils.summarizeCompare(compare, { limit: 40 });

  if (!summary.hasCompare) {
    box.innerHTML =
      '<div class="publish-empty">Could not load changed files. Publishing may still work.</div>';
    return;
  }

  if (summary.nothingToPublish) {
    box.innerHTML =
      `<div class="ps-head"><span class="ps-title">Nothing to publish</span>` +
      `<span class="ps-count">${esc(state.workBranch)} is up to date with ${esc(state.defaultBranch)}</span></div>` +
      `<div class="publish-empty">No file changes found between branches.</div>`;
    return;
  }

  const rows = summary.shown
    .map((file) => {
      return `<li><span class="pf-status ${escAttr(file.status)}">${esc(file.label)}</span><span class="pf-path" title="${escAttr(file.path)}">${esc(file.path)}</span></li>`;
    })
    .join('');

  const more = summary.moreCount
    ? `<li><span class="pf-status">more</span><span class="pf-path">…and ${summary.moreCount} more files</span></li>`
    : '';

  box.innerHTML =
    `<div class="ps-head"><span class="ps-title">Files to publish</span>` +
    `<span class="ps-count">${summary.total} file${summary.total === 1 ? '' : 's'}${summary.ahead !== null ? ` · ${summary.ahead} commit${summary.ahead === 1 ? '' : 's'} ahead` : ''}</span></div>` +
    `<ul class="publish-files">${rows || '<li><span class="pf-path">Branch has commits but no file list was returned.</span></li>'}${more}</ul>`;
}

async function loadPublishSummary() {
  const box = el('pubSummary');
  const btn = el('pubConfirm');
  if (btn) {
    btn.disabled = true;
    btn.title = 'Loading changed files…';
  }
  box.innerHTML = '<div class="publish-empty">Loading changed files…</div>';

  try {
    // Ref SHA check is more authoritative than compare output. GitHub's compare
    // response can briefly/stickily report stale ahead data, but if both branch
    // refs point to the same commit there is definitely nothing to publish.
    const [baseRef, headRef] = await Promise.all([
      GitHubApi.getRef(state.defaultBranch),
      GitHubApi.getRef(state.workBranch)
    ]);

    const pinnedBaseSha = LastWriteCommitCache.get(state.defaultBranch);
    const pinnedHeadSha = LastWriteCommitCache.get(state.workBranch);

    if (
      PublishUtils.refsOrPinnedBranchesAligned({ baseRef, headRef, pinnedBaseSha, pinnedHeadSha })
    ) {
      renderPublishSummary(PublishUtils.alignedCompareSummary());
      return;
    }

    // Use effective SHAs to avoid stale branch refs after Save or Publish.
    const baseSha = PublishUtils.effectiveBaseSha({ baseRef, pinnedSha: pinnedBaseSha });
    const headSha = PublishUtils.effectiveHeadSha({ headRef, pinnedSha: pinnedHeadSha });
    const compare =
      baseSha && headSha
        ? await GitHubApi.compare(baseSha, headSha)
        : await GitHubApi.compare(state.defaultBranch, state.workBranch);
    renderPublishSummary(compare);
  } catch (e) {
    lastPublishCompare = null;
    setPublishConfirmState(null);
    box.innerHTML = `<div class="publish-empty">Could not load changed files: ${esc(e.message)}.</div>`;
  }
}

async function openPublishModal() {
  syncActiveFromTextarea();
  const dirty = Store.dirtyFragments();
  const warn = el('pubWarn');
  if (dirty.length) {
    warn.innerHTML = `<b>${dirty.length}</b> fragment${dirty.length === 1 ? ' has' : 's have'} unsaved changes that won't be published. Save them to ${esc(state.workBranch)} first.`;
    warn.classList.add('show');
  } else warn.classList.remove('show');

  el('pubErr').classList.remove('show');
  el('pubModal').classList.add('show');
  await loadPublishSummary();
}
