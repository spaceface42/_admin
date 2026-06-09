const SNAPSHOT_PUBLISH_TITLE_MAX_LENGTH = 80;

function snapshotPublishTitleSlug(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SNAPSHOT_PUBLISH_TITLE_MAX_LENGTH)
    .replace(/-+$/g, '');
}

function snapshotPublishTimestamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace('T', '-')
    .replace(/:/g, '');
}

function snapshotPublishTagName(title = '') {
  const slug = snapshotPublishTitleSlug(title);
  const timestamp = snapshotPublishTimestamp();
  return 'snapshot-' + timestamp + (slug ? '--' + slug : '');
}

function snapshotPublishPromptTitle() {
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') return '';

  const title = window.prompt(
    'Optional snapshot title for History.\n\nLeave empty for a date-only snapshot tag.',
    ''
  );

  return title === null ? '' : title;
}

/* ---------- publish ---------- */
const SNAPSHOT_TAG_PREFIX = 'snapshot-';

function snapshotPad(n) {
  return String(n).padStart(2, '0');
}

function snapshotTimestamp(date = new Date()) {
  return (
    date.getFullYear() +
    '-' +
    snapshotPad(date.getMonth() + 1) +
    '-' +
    snapshotPad(date.getDate()) +
    '-' +
    snapshotPad(date.getHours()) +
    snapshotPad(date.getMinutes()) +
    snapshotPad(date.getSeconds())
  );
}

function snapshotTagName(date = new Date()) {
  return SNAPSHOT_TAG_PREFIX + snapshotTimestamp(date);
}

async function createSnapshotTagForPublish(sha) {
  const tagName = snapshotPublishTagName(snapshotPublishPromptTitle());

  await GitHubApi.request(GitHubApi.repoPath('/git/refs'), {
    method: 'POST',
    body: {
      ref: 'refs/tags/' + tagName,
      sha
    }
  });

  return tagName;
}

async function createSnapshotAfterPublishResult(publishResult) {
  if (!publishResult || !publishResult.published || !publishResult.sha) return null;
  return createSnapshotTagForPublish(publishResult.sha);
}
let publishInFlight = false;
el('publishBtn').onclick = openPublishModal;
el('pubCancel').onclick = () => el('pubModal').classList.remove('show');
el('pubConfirm').onclick = doPublish;

async function branchRefInfo() {
  const [baseRef, headRef] = await Promise.all([
    GitHubApi.getRef(state.defaultBranch),
    GitHubApi.getRef(state.workBranch)
  ]);
  const pinnedBaseSha = LastWriteCommitCache.get(state.defaultBranch);
  const pinnedHeadSha = LastWriteCommitCache.get(state.workBranch);
  return { baseRef, headRef, pinnedBaseSha, pinnedHeadSha };
}

function branchInfoAligned(info) {
  return PublishUtils.refsOrPinnedBranchesAligned({
    baseRef: info.baseRef,
    headRef: info.headRef,
    pinnedBaseSha: info.pinnedBaseSha,
    pinnedHeadSha: info.pinnedHeadSha
  });
}

async function branchesAreAligned() {
  return branchInfoAligned(await branchRefInfo());
}

async function ensureWorkBranchUsesPinnedSha(info) {
  // Immediately after Save → Content, GitHub's content branch ref can lag.
  // If we know the saved commit SHA, make sure refs/heads/content points to it
  // before publish uses the branch name/SHA.
  const pinned = info && info.pinnedHeadSha;
  if (!pinned) return;
  const current = PublishUtils.refSha(info.headRef);
  if (current === pinned) return;
  await GitHubApi.updateRef(state.workBranch, pinned, { force: true });
  Store.clearContentTree();
}

async function publishContentToMain() {
  // Source-of-truth model:
  // content is the CMS source branch. main is deploy-only.
  // Therefore publishing should move main to the effective content commit,
  // not merge main into content and then merge content into main.
  const info = await branchRefInfo();

  if (branchInfoAligned(info)) {
    lastPublishCompare = PublishUtils.alignedCompareSummary();
    return { published: false, reason: 'already-aligned' };
  }

  await ensureWorkBranchUsesPinnedSha(info);

  const fresh = await branchRefInfo();
  const publishSha = PublishUtils.effectivePublishSha({
    headRef: fresh.headRef,
    pinnedHeadSha: fresh.pinnedHeadSha
  });

  if (!publishSha) throw new Error(`Could not resolve ${state.workBranch} commit SHA.`);

  await GitHubApi.updateRef(state.defaultBranch, publishSha, { force: true });
  Store.clearContentTree();

  // updateRef() succeeded, so locally pin both branches to the deployed SHA.
  // GitHub's ref/compare APIs can lag briefly; the cache prevents false errors
  // and repeated publish prompts immediately after a successful publish.
  LastWriteCommitCache.set(state.defaultBranch, publishSha);
  LastWriteCommitCache.set(state.workBranch, publishSha);
  lastPublishCompare = PublishUtils.alignedCompareSummary();

  return { published: true, sha: publishSha };
}

async function doPublish() {
  if (publishInFlight) return;
  const btn = el('pubConfirm');
  const err = el('pubErr');
  err.classList.remove('show');

  publishInFlight = true;
  btn.disabled = true;
  btn.textContent = 'Checking…';

  try {
    const info = await branchRefInfo();
    if (branchInfoAligned(info)) {
      const aligned = PublishUtils.alignedCompareSummary();
      lastPublishCompare = aligned;
      renderPublishSummary(aligned);
      err.textContent = PublishUtils.publishBlockedReason(aligned);
      err.classList.add('show');
      return;
    }

    await ensureWorkBranchUsesPinnedSha(info);

    const freshInfo = await branchRefInfo();
    const baseSha = PublishUtils.effectiveBaseSha({
      baseRef: freshInfo.baseRef,
      pinnedSha: freshInfo.pinnedBaseSha
    });
    const headSha = PublishUtils.effectiveHeadSha({
      headRef: freshInfo.headRef,
      pinnedSha: freshInfo.pinnedHeadSha
    });
    const freshCompare =
      baseSha && headSha
        ? await GitHubApi.compare(baseSha, headSha)
        : await GitHubApi.compare(state.defaultBranch, state.workBranch);
    lastPublishCompare = freshCompare;

    if (!PublishUtils.canPublishCompare(freshCompare)) {
      renderPublishSummary(freshCompare);
      err.textContent = PublishUtils.publishBlockedReason(freshCompare);
      err.classList.add('show');
      return;
    }

    btn.textContent = 'Publishing…';
    const publishResult = await publishContentToMain();
    let snapshotTag = null;
    if (publishResult && publishResult.published && publishResult.sha) {
      try {
        snapshotTag = await createSnapshotAfterPublishResult(publishResult);
      } catch (snapshotErr) {
        console.warn('Snapshot creation after publish failed', snapshotErr);
        toast(
          'Published, but snapshot was not created: ' +
            GitHubErrors.githubErrorMessage(snapshotErr, { action: 'Create snapshot' }),
          'err'
        );
      }
    }

    el('pubModal').classList.remove('show');
    toast(
      snapshotTag
        ? 'Published — main now matches content. Snapshot: ' + snapshotTag
        : 'Published — main now matches content',
      'ok'
    );
    await loadAll();
  } catch (e) {
    const conflict = PublishUtils.publishConflictInfo(e, {
      owner: state.owner,
      repo: state.repo,
      base: state.defaultBranch,
      head: state.workBranch,
      workBranch: state.workBranch,
      defaultBranch: state.defaultBranch
    });
    if (conflict) {
      err.innerHTML =
        `${esc(conflict.message)} ` +
        `Resolve it on GitHub: <a href="${escAttr(conflict.url)}" target="_blank" rel="noopener">open the compare view ↗</a>.`;
    } else {
      err.textContent = GitHubErrors.githubErrorMessage(e, { action: 'Publish' });
    }
    err.classList.add('show');
  } finally {
    publishInFlight = false;
    btn.textContent = 'Publish';
    setPublishConfirmState(lastPublishCompare);
  }
}
