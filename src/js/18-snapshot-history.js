/* ---------- snapshot history / rollback ---------- */
const SNAPSHOT_HISTORY_PREFIX = 'snapshot-';
const SNAPSHOT_METADATA_PATH = '.gitcms/snapshots.json';
const SNAPSHOT_NAME_MAX_LENGTH = 80;

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
    'linear-gradient(135deg, hsl(' +
    hue +
    ' 55% 18% / 0.88), hsl(' +
    hue +
    ' 40% 10% / 0.52))';
}

function snapshotHistoryNumberTags(tags) {
  const sortedOldestFirst = [...tags].sort((a, b) => a.name.localeCompare(b.name));
  const byName = new Map();
  sortedOldestFirst.forEach((tag, index) => {
    byName.set(tag.name, index + 1);
  });
  return byName;
}

function snapshotHistoryEmptyMetadata() {
  return {
    version: 1,
    snapshots: {}
  };
}

function snapshotHistoryNormalizeMetadata(raw) {
  const out = snapshotHistoryEmptyMetadata();
  if (!raw || typeof raw !== 'object') return out;

  const snapshots = raw.snapshots && typeof raw.snapshots === 'object' ? raw.snapshots : {};
  for (const [tagName, entry] of Object.entries(snapshots)) {
    if (!tagName || !entry || typeof entry !== 'object') continue;

    const name = snapshotHistoryNormalizeName(entry.name || '');
    const note = String(entry.note || '');
    const updatedAt = String(entry.updatedAt || '');

    if (!name && !note && !updatedAt) continue;

    out.snapshots[tagName] = {
      ...(name ? { name } : {}),
      ...(note ? { note } : {}),
      ...(updatedAt ? { updatedAt } : {})
    };
  }

  return out;
}

function snapshotHistoryNormalizeName(name) {
  return String(name || '').trim().slice(0, SNAPSHOT_NAME_MAX_LENGTH);
}

function snapshotHistoryMetadataEntry(metadata, tagName) {
  const meta = snapshotHistoryNormalizeMetadata(metadata);
  return meta.snapshots[tagName] || {};
}

function snapshotHistoryDisplayName(tag, metadata) {
  return snapshotHistoryNormalizeName(snapshotHistoryMetadataEntry(metadata, tag.name).name || '');
}

async function snapshotHistoryLoadMetadata() {
  try {
    const file = await GitHubApi.getFileForWrite(SNAPSHOT_METADATA_PATH, state.workBranch);
    const parsed = JSON.parse(dec(file.content));
    return {
      metadata: snapshotHistoryNormalizeMetadata(parsed),
      sha: file.sha || null,
      warning: ''
    };
  } catch (e) {
    if (e && e.status === 404) {
      return {
        metadata: snapshotHistoryEmptyMetadata(),
        sha: null,
        warning: ''
      };
    }

    console.warn('Could not load snapshot metadata', e);
    return {
      metadata: snapshotHistoryEmptyMetadata(),
      sha: null,
      warning: 'Snapshot names metadata could not be read. Showing tag/date fallback names.'
    };
  }
}

async function snapshotHistorySaveMetadata(metadataState, metadata) {
  const clean = snapshotHistoryNormalizeMetadata(metadata);
  const content = JSON.stringify(clean, null, 2) + '\n';

  await GitHubApi.saveFile(SNAPSHOT_METADATA_PATH, {
    message: 'cms: update snapshot names',
    content: enc(content),
    branch: state.workBranch,
    sha: metadataState && metadataState.sha ? metadataState.sha : null
  });

  Store.clearContentTree();
}

function snapshotHistoryValidateName(name) {
  const clean = snapshotHistoryNormalizeName(name);

  if (/[<>]/.test(clean)) {
    throw new Error('Snapshot names must be plain text. Do not use HTML tags.');
  }

  return clean;
}

function snapshotHistorySetSnapshotName(metadata, tagName, name) {
  const clean = snapshotHistoryValidateName(name);
  const next = snapshotHistoryNormalizeMetadata(metadata);
  const existing = next.snapshots[tagName] || {};
  const note = String(existing.note || '').trim();

  if (!clean && !note) {
    delete next.snapshots[tagName];
    return next;
  }

  next.snapshots[tagName] = {
    ...(clean ? { name: clean } : {}),
    ...(note ? { note } : {}),
    updatedAt: new Date().toISOString()
  };

  return next;
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
  btn.innerHTML = 'History';
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
    <div class="modal wide">
      <h3>Snapshot history</h3>
      <p class="muted">
        Snapshot tags are created after publishing. Rollback moves both content and main to the
        selected snapshot commit. Rollback does not create a new snapshot tag.
      </p>
      <p class="muted">
        Custom snapshot names are stored in <code>${esc(SNAPSHOT_METADATA_PATH)}</code> on
        <code>${esc(state.workBranch || DEFAULT_WORK_BRANCH)}</code>. Git tag names stay unchanged.
      </p>
      <div class="err" id="snapshotHistoryErr"></div>
      <div class="warn" id="snapshotHistoryWarn"></div>
      <div class="row gap">
        <button class="btn ghost" id="snapshotHistoryRefreshBtn" type="button">Refresh snapshots</button>
      </div>
      <div class="media-grid" id="snapshotHistoryList">
        <div class="muted">Open History to load snapshots.</div>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" id="snapshotHistoryCloseBtn" type="button">Close</button>
      </div>
    </div>
  `;

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
  snapshotHistorySetWarn('Connect to a content/site repository first.<br>Snapshot tags live in that repository.');
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

async function snapshotHistoryRename(tag) {
  if (!snapshotHistoryRequireConnection()) return;
  if (!tag || !tag.name || !tag.name.startsWith(SNAPSHOT_HISTORY_PREFIX)) {
    snapshotHistorySetErr('Only snapshot-* tags can be renamed here.');
    return;
  }

  snapshotHistorySetErr('');
  snapshotHistorySetWarn('Loading snapshot name metadata…');

  try {
    const metadataState = await snapshotHistoryLoadMetadata();
    const currentName = snapshotHistoryDisplayName(tag, metadataState.metadata);
    const nextName = window.prompt(
      'Snapshot name. Leave empty to clear the custom name.',
      currentName || ''
    );

    if (nextName === null) {
      snapshotHistorySetWarn('');
      return;
    }

    const nextMetadata = snapshotHistorySetSnapshotName(metadataState.metadata, tag.name, nextName);
    snapshotHistorySetWarn('Saving snapshot name…');
    await snapshotHistorySaveMetadata(metadataState, nextMetadata);

    toast('Snapshot name saved', 'ok');
    await snapshotHistoryRefresh();
  } catch (e) {
    snapshotHistorySetWarn('');
    snapshotHistorySetErr(
      GitHubErrors.githubErrorMessage(e, {
        action: 'Rename snapshot'
      })
    );
    toast('Rename snapshot failed', 'err');
  }
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
      '?\n\nThis deletes only the Git tag.\nIt does not change content or main.'
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
    snapshotHistorySetErr(
      GitHubErrors.githubErrorMessage(e, {
        action: 'Delete snapshot'
      })
    );
    toast('Delete snapshot failed', 'err');
  }
}

function snapshotHistoryRender(tags, metadata = snapshotHistoryEmptyMetadata()) {
  const list = document.getElementById('snapshotHistoryList');
  if (!list) return;

  if (!tags.length) {
    list.innerHTML = '<div class="muted">No snapshot tags found.</div>';
    return;
  }

  list.innerHTML = '';
  const snapshotNumberByName = snapshotHistoryNumberTags(tags);

  for (const tag of tags) {
    const card = document.createElement('div');
    card.className = 'media-card snapshot-history-card';
    snapshotHistoryApplyColor(card, tag);

    const snapshotNumber = snapshotNumberByName.get(tag.name) || 0;
    const customName = snapshotHistoryDisplayName(tag, metadata);
    const displayTitle = customName || 'Snapshot #' + snapshotNumber;

    card.innerHTML = `
      <div class="snapshot-history-head">
        <div class="snapshot-history-title-wrap">
          <div class="snapshot-history-title">${esc(displayTitle)}</div>
          <div class="snapshot-history-date">${esc(snapshotHistoryDisplayDate(tag.name))}</div>
        </div>
        <div class="snapshot-history-number">${esc(String(snapshotNumber))}</div>
      </div>
      <div class="muted mono">${esc(tag.name)}</div>
      <div class="muted mono">Commit ${esc(snapshotHistoryShortSha(tag.sha))}</div>
      <div class="snapshot-history-actions">
        <a class="btn ghost" href="${escAttr(snapshotHistoryTagUrl(tag.name))}" target="_blank" rel="noopener">Open</a>
        <button class="btn ghost" type="button" data-action="rename">Rename</button>
        <button class="btn ghost" type="button" data-action="rollback">Rollback</button>
        <button class="btn danger" type="button" data-action="delete">Delete</button>
      </div>
    `;

    card.querySelector('[data-action="rename"]').onclick = () => snapshotHistoryRename(tag);
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
    const [tags, metadataState] = await Promise.all([
      snapshotHistoryListTags(),
      snapshotHistoryLoadMetadata()
    ]);

    snapshotHistorySetWarn(
      (metadataState.warning ? esc(metadataState.warning) + '<br>' : '') +
        (tags.length
          ? 'Rollback: moves both content and main to the selected snapshot commit.<br>No new snapshot tag is created.'
          : '')
    );
    snapshotHistoryRender(tags, metadataState.metadata);
  } catch (e) {
    snapshotHistorySetWarn('');
    snapshotHistorySetErr(
      GitHubErrors.githubErrorMessage(e, {
        action: 'Load snapshots'
      })
    );
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

    snapshotHistorySetWarn('Rollback complete.<br>Refreshing editor from rollback commit…');
    toast('Rolled back to ' + tag.name, 'ok');

    await snapshotHistoryRefreshEditorAfterRollback(tag);

    snapshotHistorySetWarn(`Rollback complete.
Both content and main now point to ${esc(tag.name)}.`);
    await snapshotHistoryRefresh();
  } catch (e) {
    snapshotHistorySetWarn('');
    snapshotHistorySetErr(
      GitHubErrors.githubErrorMessage(e, {
        action: 'Rollback snapshot'
      })
    );
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
