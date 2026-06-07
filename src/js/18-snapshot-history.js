/* ---------- snapshot history / rollback ---------- */
const SNAPSHOT_HISTORY_PREFIX = 'snapshot-';

function snapshotHistoryConnected() {
  return !!(state && state.owner && state.repo && state.token);
}

function snapshotHistoryTagNameFromRef(ref) {
  return String(ref || '').replace(/^refs\/tags\//, '');
}

function snapshotHistoryShortSha(sha) {
  return sha ? sha.slice(0, 7) + '…' + sha.slice(-7) : 'unknown';
}

function snapshotHistoryParseDate(name) {
  const m = String(name || '').match(/^snapshot-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;

  return {
    year: m[1],
    month: m[2],
    day: m[3],
    hour: m[4],
    minute: m[5],
    second: m[6]
  };
}

function snapshotHistoryDisplayDate(name) {
  const d = snapshotHistoryParseDate(name);
  if (!d) return String(name || '');

  return d.year + '-' + d.month + '-' + d.day + ' ' + d.hour + ':' + d.minute + ':' + d.second;
}

function snapshotHistoryAccentHue(name) {
  const d = snapshotHistoryParseDate(name);
  if (d) {
    const seed =
      Number(d.month) * 31 +
      Number(d.day) * 17 +
      Number(d.hour) * 13 +
      Number(d.minute) * 7 +
      Number(d.second);
    return seed % 360;
  }

  let hash = 0;
  for (const ch of String(name || 'snapshot')) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

function snapshotHistoryApplyColor(card, tag) {
  const hue = snapshotHistoryAccentHue(tag.name);
  card.style.borderColor = 'hsl(' + hue + ' 70% 55% / 0.9)';
  card.style.background =
    'linear-gradient(135deg, hsl(' + hue + ' 55% 18% / 0.88), hsl(' + hue + ' 40% 10% / 0.52))';
}

function ensureSnapshotHistoryButton() {
  let btn = document.getElementById('snapshotHistoryBtn');
  if (btn) return btn;

  const diagnosticsBtn = document.getElementById('diagnosticsBtn');
  if (!diagnosticsBtn || !diagnosticsBtn.parentNode) return null;

  btn = document.createElement('button');
  btn.className = 'tbtn ghost';
  btn.id = 'snapshotHistoryBtn';
  btn.title = 'List snapshot tags and rollback';
  btn.type = 'button';
  btn.setAttribute('onclick', 'openSnapshotHistory(); return false;');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 12a9 9 0 109-9" />
      <path d="M3 3v6h6" />
      <path d="M12 7v5l3 3" />
    </svg>
    History`;

  diagnosticsBtn.parentNode.insertBefore(btn, diagnosticsBtn);
  return btn;
}

function ensureSnapshotHistoryModal() {
  let modal = document.getElementById('snapshotHistoryModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.className = 'modal-bg';
  modal.id = 'snapshotHistoryModal';
  modal.innerHTML = `
    <div class="modal media-modal">
      <h3>Snapshot history</h3>
      <p class="mdesc">
        Snapshot tags are created after publishing. Rollback moves both
        <span class="mono">content</span> and <span class="mono">main</span>
        to the selected snapshot commit. Rollback does not create a new snapshot tag.
      </p>

      <div class="modal-row" style="justify-content:flex-start;margin-bottom:12px">
        <button class="tbtn ghost" type="button" id="snapshotHistoryRefreshBtn">
          Refresh snapshots
        </button>
      </div>

      <div class="modal-warn" id="snapshotHistoryWarn"></div>
      <div class="modal-err" id="snapshotHistoryErr"></div>
      <div class="media-grid" id="snapshotHistoryList">
        <div class="media-empty">Open History to load snapshots.</div>
      </div>

      <div class="modal-row">
        <button class="tbtn" type="button" id="snapshotHistoryCloseBtn">Close</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  wireSnapshotHistoryControls();
  return modal;
}

function snapshotHistorySetErr(msg) {
  const err = document.getElementById('snapshotHistoryErr');
  if (!err) return;
  err.textContent = msg || '';
  err.classList.toggle('show', !!msg);
}

function snapshotHistorySetWarn(msg) {
  const warn = document.getElementById('snapshotHistoryWarn');
  if (!warn) return;
  warn.innerHTML = msg || '';
  warn.classList.toggle('show', !!msg);
}

function snapshotHistoryRequireConnection() {
  if (snapshotHistoryConnected()) return true;

  snapshotHistorySetErr('');
  snapshotHistorySetWarn(
    'Connect to a content/site repository first. Snapshot tags live in that repository.'
  );
  snapshotHistoryRender([]);
  return false;
}

function snapshotHistoryTagUrl(tagName) {
  return `https://github.com/${state.owner}/${state.repo}/tree/${encodeURIComponent(tagName)}`;
}

async function snapshotHistoryResolveCommitSha(ref) {
  if (!ref || !ref.object || !ref.object.sha) return '';

  if (ref.object.type === 'commit') return ref.object.sha;

  if (ref.object.type === 'tag') {
    const tag = await GitHubApi.request(
      GitHubApi.repoPath('/git/tags/' + encodeURIComponent(ref.object.sha))
    );
    return tag && tag.object && tag.object.sha ? tag.object.sha : ref.object.sha;
  }

  return ref.object.sha;
}

async function snapshotHistoryListTags() {
  const refs = await GitHubApi.request(
    GitHubApi.repoPath('/git/matching-refs/tags/' + SNAPSHOT_HISTORY_PREFIX)
  );

  const out = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    const name = snapshotHistoryTagNameFromRef(ref.ref);
    if (!name.startsWith(SNAPSHOT_HISTORY_PREFIX)) continue;

    out.push({
      name,
      sha: await snapshotHistoryResolveCommitSha(ref),
      rawSha: ref.object && ref.object.sha ? ref.object.sha : '',
      type: ref.object && ref.object.type ? ref.object.type : 'commit'
    });
  }

  return out.sort((a, b) => b.name.localeCompare(a.name));
}

async function snapshotHistoryDelete(tag) {
  if (!snapshotHistoryRequireConnection()) return;

  if (!tag || !tag.name || !tag.name.startsWith(SNAPSHOT_HISTORY_PREFIX)) {
    snapshotHistorySetErr('Only snapshot-* tags can be deleted here.');
    return;
  }

  const ok = confirm(
    'Delete snapshot tag ' +
      tag.name +
      '?\n\nThis deletes only the Git tag. It does not change content or main.'
  );
  if (!ok) return;

  snapshotHistorySetErr('');
  snapshotHistorySetWarn('Deleting snapshot tag…');

  try {
    await GitHubApi.request(GitHubApi.repoPath('/git/refs/tags/' + encodeURIComponent(tag.name)), {
      method: 'DELETE'
    });

    toast('Deleted snapshot ' + tag.name, 'ok');
    await snapshotHistoryRefresh();
  } catch (e) {
    snapshotHistorySetWarn('');
    snapshotHistorySetErr(GitHubErrors.githubErrorMessage(e, { action: 'Delete snapshot' }));
    toast('Delete snapshot failed', 'err');
  }
}

function snapshotHistoryRender(tags) {
  const list = document.getElementById('snapshotHistoryList');
  if (!list) return;

  if (!tags.length) {
    list.innerHTML = '<div class="media-empty">No snapshot tags found.</div>';
    return;
  }

  list.innerHTML = '';
  for (const tag of tags) {
    const card = document.createElement('div');
    card.className = 'media-card';
    snapshotHistoryApplyColor(card, tag);
    card.innerHTML = `
      <div class="media-name" style="font-size:15px;color:var(--txt)">${esc(snapshotHistoryDisplayDate(tag.name))}</div>
      <div class="media-path mono">${esc(tag.name)}</div>
      <div class="media-path mono">${esc(snapshotHistoryShortSha(tag.sha))}</div>
      <div class="media-actions">
        <a class="media-action copy" href="${escAttr(snapshotHistoryTagUrl(tag.name))}" target="_blank" rel="noopener">Open</a>
        <button class="media-action" type="button" data-action="rollback">Rollback</button>
        <button class="media-action delete" type="button" data-action="delete">Delete</button>
      </div>`;

    card.querySelector('[data-action="rollback"]').onclick = () => snapshotHistoryRollback(tag);
    card.querySelector('[data-action="delete"]').onclick = () => snapshotHistoryDelete(tag);
    list.appendChild(card);
  }
}

async function snapshotHistoryRefresh() {
  ensureSnapshotHistoryModal();
  snapshotHistorySetErr('');
  if (!snapshotHistoryRequireConnection()) return;

  snapshotHistorySetWarn('Loading snapshot tags…');

  try {
    const tags = await snapshotHistoryListTags();
    snapshotHistorySetWarn(
      tags.length
        ? '<b>Rollback:</b> moves both content and main to the selected snapshot commit. No new snapshot tag is created.'
        : ''
    );
    snapshotHistoryRender(tags);
  } catch (e) {
    snapshotHistorySetWarn('');
    snapshotHistorySetErr(GitHubErrors.githubErrorMessage(e, { action: 'Load snapshots' }));
  }
}

async function snapshotHistoryRefreshEditorAfterRollback(tag) {
  LastWriteCommitCache.set(state.workBranch, tag.sha);
  LastWriteCommitCache.set(state.defaultBranch, tag.sha);
  Store.clearContentTree();

  if (typeof loadAll === 'function') await loadAll();

  // GitHub ref reads can lag briefly after force-updating both branches.
  // A delayed second reload mirrors the manual Refresh button behavior and
  // makes the editor settle on the rollback commit without user action.
  await sleep(1400);

  LastWriteCommitCache.set(state.workBranch, tag.sha);
  LastWriteCommitCache.set(state.defaultBranch, tag.sha);
  Store.clearContentTree();

  if (typeof loadAll === 'function') await loadAll();
}

async function snapshotHistoryRollback(tag) {
  if (!snapshotHistoryRequireConnection()) return;

  const dirty = Store.dirtyFragments();
  if (dirty.length) {
    snapshotHistorySetErr('Save or reset unsaved fragments before rollback.');
    return;
  }

  const ok = confirm(
    `Rollback both branches to ${tag.name}?\n\n` +
      `Target commit: ${tag.sha}\n` +
      `Branches: ${state.workBranch} and ${state.defaultBranch}\n\n` +
      'No new snapshot tag will be created.'
  );

  if (!ok) return;

  snapshotHistorySetErr('');
  snapshotHistorySetWarn('Rolling back content and main…');

  try {
    await GitHubApi.updateRef(state.workBranch, tag.sha, { force: true });
    await GitHubApi.updateRef(state.defaultBranch, tag.sha, { force: true });

    snapshotHistorySetWarn('Rollback complete. Refreshing editor from rollback commit…');
    toast('Rolled back to ' + tag.name, 'ok');

    await snapshotHistoryRefreshEditorAfterRollback(tag);

    snapshotHistorySetWarn(
      'Rollback complete. Both content and main now point to ' + esc(tag.name) + '.'
    );
    await snapshotHistoryRefresh();
  } catch (e) {
    snapshotHistorySetWarn('');
    snapshotHistorySetErr(GitHubErrors.githubErrorMessage(e, { action: 'Rollback snapshot' }));
    toast('Rollback failed', 'err');
  }
}

function openSnapshotHistory() {
  const modal = ensureSnapshotHistoryModal();
  wireSnapshotHistoryControls();
  modal.classList.add('show');
  snapshotHistoryRefresh();
}

function wireSnapshotHistoryControls() {
  const refreshBtn = document.getElementById('snapshotHistoryRefreshBtn');
  if (refreshBtn && refreshBtn.dataset.snapshotHistoryWired !== '1') {
    refreshBtn.dataset.snapshotHistoryWired = '1';
    refreshBtn.onclick = snapshotHistoryRefresh;
  }

  const closeBtn = document.getElementById('snapshotHistoryCloseBtn');
  if (closeBtn && closeBtn.dataset.snapshotHistoryWired !== '1') {
    closeBtn.dataset.snapshotHistoryWired = '1';
    closeBtn.onclick = () => {
      const modal = document.getElementById('snapshotHistoryModal');
      if (modal) modal.classList.remove('show');
    };
  }
}

function snapshotHistoryClickHandler(event) {
  const target =
    event && event.target && event.target.closest
      ? event.target.closest('#snapshotHistoryBtn')
      : null;
  if (!target) return;

  event.preventDefault();
  event.stopPropagation();
  openSnapshotHistory();
}

window.openSnapshotHistory = openSnapshotHistory;

function setupSnapshotHistory() {
  const btn = ensureSnapshotHistoryButton();

  if (btn) {
    btn.onclick = (event) => {
      if (event) event.preventDefault();
      openSnapshotHistory();
    };
  }
}

function startSnapshotHistory() {
  setupSnapshotHistory();

  if (!window.__gitcmsSnapshotHistoryDelegatedClick) {
    window.__gitcmsSnapshotHistoryDelegatedClick = true;
    document.addEventListener('click', snapshotHistoryClickHandler, true);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startSnapshotHistory, { once: true });
} else {
  startSnapshotHistory();
}
