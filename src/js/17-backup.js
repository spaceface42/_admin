/* ---------- backup / restore ---------- */

function isSafeBackupPath(path) {
  const p = String(path || '')
    .replace(/\\/g, '/')
    .trim();
  if (!p) return false;
  if (p.startsWith('/')) return false;
  if (/^[A-Za-z]:\//.test(p)) return false;
  const parts = p.split('/').filter(Boolean);
  if (parts.includes('..')) return false;
  if (parts.includes('.git')) return false;
  return true;
}

function isRestorableBackupPath(path, mediaDirPath) {
  const mediaRoot = String(mediaDirPath || '').replace(/\/+$/, '');
  return (
    /\.html?$/i.test(path) ||
    path === state.manifestPath ||
    path === CONFIG_PATH ||
    (mediaRoot && path.startsWith(mediaRoot + '/'))
  );
}

el('backupBtn').onclick = () => {
  el('backupRestoreErr').textContent = '';
  el('backupRestoreErr').classList.remove('show');
  el('backupModal').classList.add('show');
};
el('backupClose').onclick = () => el('backupModal').classList.remove('show');
el('backupDownloadBtn').onclick = downloadBackup;
el('backupRestoreFile').onchange = (e) => {
  const file = e.target.files[0];
  el('backupRestoreBtn').disabled = !file;
  el('backupRestoreBtn').textContent = file ? `Restore "${file.name}"` : 'Restore from ZIP';
};
el('backupRestoreBtn').onclick = () => {
  const file = el('backupRestoreFile').files[0];
  if (file) restoreBackup(file);
};

async function downloadBackup() {
  const btn = el('backupDownloadBtn');
  btn.disabled = true;
  const mdir = mediaDir();

  try {
    const snapshot = await GitHubApi.getBranchTreeSnapshot(state.workBranch, { force: true });
    const blobs = (snapshot.tree || []).filter((n) => n.type === 'blob');

    const wanted = blobs.filter((n) => {
      const p = n.path;
      return (
        /\.html?$/i.test(p) ||
        p === state.manifestPath ||
        p === 'gitcms.config.json' ||
        p.startsWith(mdir + '/')
      );
    });

    const zip = new JSZip();
    zip.file(
      'metadata.json',
      JSON.stringify(
        {
          version: '1.1.87-snapshot-history-numbering',
          repo: `${state.owner}/${state.repo}`,
          branch: state.workBranch,
          commitSha: snapshot.commitSha || '',
          timestamp: new Date().toISOString(),
          files: wanted.map((n) => n.path)
        },
        null,
        2
      )
    );

    let done = 0;
    await Promise.all(
      wanted.map(async (node) => {
        try {
          const r = await GitHubApi.getContent(node.path, snapshot.commitSha || state.workBranch);
          const isText = /\.(html?|json|css|js|txt|md|svg)$/i.test(node.path);
          zip.file(node.path, isText ? dec(r.content) : r.content, { base64: !isText });
        } catch (e) {
          console.warn('backup skip', node.path, e);
        }
        btn.textContent = `Downloading… ${++done}/${wanted.length}`;
      })
    );

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gitcms-backup-${state.repo}-${date}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded', 'ok');
    el('backupModal').classList.remove('show');
  } catch (e) {
    toast('Backup failed: ' + e.message, 'err');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Download ZIP';
  }
}

async function restoreBackup(file) {
  const btn = el('backupRestoreBtn');
  const errEl = el('backupRestoreErr');
  btn.disabled = true;
  errEl.textContent = '';
  errEl.classList.remove('show');

  try {
    const zip = await JSZip.loadAsync(file);
    const metaFile = zip.file('metadata.json');
    if (!metaFile) throw new Error('Not a valid GitCMS backup — metadata.json missing.');

    const meta = JSON.parse(await metaFile.async('string'));
    if (!Array.isArray(meta.files)) {
      throw new Error('Not a valid GitCMS backup — metadata.files must be an array.');
    }
    const mdir = mediaDir();
    const paths = meta.files
      .map((p) => String(p || '').trim())
      .filter((p) => p && p !== 'metadata.json' && !p.endsWith('/'));
    for (const path of paths) {
      if (!isSafeBackupPath(path) || !isRestorableBackupPath(path, mdir)) {
        throw new Error(`Backup contains an unsupported path: ${path}`);
      }
    }

    btn.textContent = `Restoring 0/${paths.length}…`;

    let done = 0;
    for (const path of paths) {
      const entry = zip.file(path);
      if (!entry) continue;

      const isText = /\.(html?|json|css|js|txt|md|svg)$/i.test(path);
      const content = isText ? enc(await entry.async('string')) : await entry.async('base64');

      let sha = null;
      try {
        const cur = await GitHubApi.getFileForWrite(path, state.workBranch);
        sha = cur.sha;
      } catch (e) {
        if (e.status !== 404) throw e;
      }

      await GitHubApi.saveFile(path, {
        message: `cms: restore from backup (${meta.timestamp || file.name})`,
        content,
        branch: state.workBranch,
        sha
      });

      btn.textContent = `Restoring ${++done}/${paths.length}…`;
    }

    Store.clearContentTree();
    toast(`Restored ${done} files to ${state.workBranch}`, 'ok');
    el('backupModal').classList.remove('show');
    el('backupRestoreFile').value = '';
    btn.textContent = 'Restore from ZIP';
    await loadAll();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.add('show');
    console.error('restore error', e);
  } finally {
    btn.disabled = false;
  }
}
