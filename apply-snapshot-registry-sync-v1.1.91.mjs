#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.91-snapshot-registry-sync';
const JS_PATH = 'src/js/18-snapshot-history.js';
const TEST_PATH = 'tests/named-snapshots.test.mjs';
const README_PATH = 'README.md';
const PACKAGE_PATH = 'package.json';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
  console.log('updated ' + path);
}

function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    throw new Error('No replacement matched for ' + label);
  }
  console.log('fixed ' + label);
  return next;
}

function updateVersionInFile(path) {
  if (!existsSync(path)) return;
  let text = read(path);
  text = text.replace(/GITCMS_VERSION\s*=\s*['"][^'"]+['"]/, "GITCMS_VERSION = '" + VERSION + "'");
  text = text.replace(/version:\s*['"][^'"]+['"]/, "version: '" + VERSION + "'");
  write(path, text);
}

if (!existsSync(JS_PATH)) {
  throw new Error('Run this from the _admin repo root. Missing ' + JS_PATH);
}

let js = read(JS_PATH);

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
if (!js.includes("const SNAPSHOT_METADATA_BRANCH = 'gitcms-metadata';")) {
  js = replaceRequired(
    js,
    "const SNAPSHOT_METADATA_PATH = '.gitcms/snapshots.json';\nconst SNAPSHOT_NAME_MAX_LENGTH = 80;",
    "const SNAPSHOT_METADATA_PATH = '.gitcms/snapshots.json';\nconst SNAPSHOT_METADATA_BRANCH = 'gitcms-metadata';\nconst SNAPSHOT_NAME_MAX_LENGTH = 80;",
    'snapshot metadata branch constant'
  );
}

// -----------------------------------------------------------------------------
// Metadata-only branch creation. This supersedes the earlier createBranchFromSha
// behavior, which could copy the whole content tree into gitcms-metadata.
// -----------------------------------------------------------------------------
const metadataOnlyHelper = `async function snapshotHistoryCreateMetadataOnlyBranch() {
  const content = JSON.stringify(snapshotHistoryEmptyMetadata(), null, 2) + '\\n';

  const blob = await GitHubApi.request(GitHubApi.repoPath('/git/blobs'), {
    method: 'POST',
    body: {
      content: enc(content),
      encoding: 'base64'
    }
  });

  const tree = await GitHubApi.request(GitHubApi.repoPath('/git/trees'), {
    method: 'POST',
    body: {
      tree: [
        {
          path: SNAPSHOT_METADATA_PATH,
          mode: '100644',
          type: 'blob',
          sha: blob.sha
        }
      ]
    }
  });

  const commit = await GitHubApi.request(GitHubApi.repoPath('/git/commits'), {
    method: 'POST',
    body: {
      message: 'cms: initialize snapshot registry',
      tree: tree.sha
    }
  });

  try {
    await GitHubApi.request(GitHubApi.repoPath('/git/refs'), {
      method: 'POST',
      body: {
        ref: 'refs/heads/' + SNAPSHOT_METADATA_BRANCH,
        sha: commit.sha
      }
    });
  } catch (e) {
    // Race-safe: another browser/session may have created it after our 404.
    if (!e || e.status !== 422) throw e;
  }

  return SNAPSHOT_METADATA_BRANCH;
}

`;

if (!js.includes('async function snapshotHistoryCreateMetadataOnlyBranch()')) {
  js = replaceRequired(
    js,
    /async function snapshotHistoryEnsureMetadataBranch\(\) \{/,
    metadataOnlyHelper + 'async function snapshotHistoryEnsureMetadataBranch() {',
    'metadata-only branch creation helper'
  );
}

const ensureBranch = `async function snapshotHistoryEnsureMetadataBranch() {
  try {
    await GitHubApi.getRef(SNAPSHOT_METADATA_BRANCH);
    return SNAPSHOT_METADATA_BRANCH;
  } catch (e) {
    if (!e || e.status !== 404) throw e;
  }

  return snapshotHistoryCreateMetadataOnlyBranch();
}
`;

js = replaceRequired(
  js,
  /async function snapshotHistoryEnsureMetadataBranch\(\) \{[\s\S]*?\n\}\n\nasync function snapshotHistoryLoadMetadata/,
  ensureBranch + '\nasync function snapshotHistoryLoadMetadata',
  'metadata branch ensure uses metadata-only root commit'
);

// -----------------------------------------------------------------------------
// Registry metadata model.
// -----------------------------------------------------------------------------
const metadataModel = `function snapshotHistoryEmptyMetadata() {
  return {
    version: 1,
    updatedAt: '',
    snapshots: {}
  };
}

function snapshotHistoryNormalizeMetadata(raw) {
  const out = snapshotHistoryEmptyMetadata();
  if (!raw || typeof raw !== 'object') return out;

  out.updatedAt = String(raw.updatedAt || '');

  const snapshots = raw.snapshots && typeof raw.snapshots === 'object' ? raw.snapshots : {};
  for (const [tagName, entry] of Object.entries(snapshots)) {
    if (!tagName || !String(tagName).startsWith(SNAPSHOT_HISTORY_PREFIX)) continue;

    const source = entry && typeof entry === 'object' ? entry : {};
    const tag = String(source.tag || tagName);
    if (!tag.startsWith(SNAPSHOT_HISTORY_PREFIX)) continue;

    const name = snapshotHistoryNormalizeName(source.name || '');
    const note = String(source.note || '').trim();
    const sha = String(source.sha || '');
    const rawSha = String(source.rawSha || '');
    const type = String(source.type || 'commit');
    const createdAt = String(source.createdAt || snapshotHistoryTagCreatedAt(tag) || '');
    const updatedAt = String(source.updatedAt || '');

    out.snapshots[tag] = {
      tag,
      ...(name ? { name } : {}),
      ...(sha ? { sha } : {}),
      ...(rawSha ? { rawSha } : {}),
      ...(type ? { type } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(note ? { note } : {}),
      ...(updatedAt ? { updatedAt } : {})
    };
  }

  return out;
}

function snapshotHistoryNormalizeName(name) {
  return String(name || '').trim().slice(0, SNAPSHOT_NAME_MAX_LENGTH);
}
`;

js = replaceRequired(
  js,
  /function snapshotHistoryEmptyMetadata\(\) \{[\s\S]*?\n\}\n\nfunction snapshotHistoryNormalizeMetadata\(raw\) \{[\s\S]*?\n\}\n\nfunction snapshotHistoryNormalizeName\(name\) \{[\s\S]*?\n\}/,
  metadataModel,
  'snapshot metadata registry model'
);

const registryHelpers = `function snapshotHistoryMetadataEntry(metadata, tagName) {
  const meta = snapshotHistoryNormalizeMetadata(metadata);
  return meta.snapshots[tagName] || {};
}

function snapshotHistoryDisplayName(tag, metadata) {
  return snapshotHistoryNormalizeName(snapshotHistoryMetadataEntry(metadata, tag.name).name || '');
}

function snapshotHistoryTagCreatedAt(name) {
  const d = snapshotHistoryParseDate(name);
  if (!d) return '';
  return d.year + '-' + d.month + '-' + d.day + 'T' + d.hour + ':' + d.minute + ':' + d.second + '.000Z';
}

function snapshotHistoryRegistryEntry(tag, existing = {}) {
  const tagName = tag && tag.name ? tag.name : String(existing.tag || '');
  const name = snapshotHistoryNormalizeName(existing.name || '');
  const note = String(existing.note || '').trim();
  const sha = String((tag && tag.sha) || existing.sha || '');
  const rawSha = String((tag && tag.rawSha) || existing.rawSha || '');
  const type = String((tag && tag.type) || existing.type || 'commit');
  const createdAt = String(existing.createdAt || snapshotHistoryTagCreatedAt(tagName) || '');
  const updatedAt = String(existing.updatedAt || '');

  return {
    tag: tagName,
    ...(name ? { name } : {}),
    ...(sha ? { sha } : {}),
    ...(rawSha ? { rawSha } : {}),
    ...(type ? { type } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(note ? { note } : {}),
    ...(updatedAt ? { updatedAt } : {})
  };
}

function snapshotHistoryEntriesEqual(a, b) {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

function snapshotHistoryReconcileMetadata(tags, metadata) {
  const current = snapshotHistoryNormalizeMetadata(metadata);
  const next = snapshotHistoryEmptyMetadata();
  const liveTags = new Set();
  let changed = false;

  for (const tag of Array.isArray(tags) ? tags : []) {
    if (!tag || !tag.name || !tag.name.startsWith(SNAPSHOT_HISTORY_PREFIX)) continue;

    liveTags.add(tag.name);
    const existing = current.snapshots[tag.name] || {};
    const entry = snapshotHistoryRegistryEntry(tag, existing);
    next.snapshots[tag.name] = entry;

    if (!snapshotHistoryEntriesEqual(existing, entry)) changed = true;
  }

  for (const oldTag of Object.keys(current.snapshots)) {
    if (!liveTags.has(oldTag)) changed = true;
  }

  next.updatedAt = changed ? new Date().toISOString() : current.updatedAt || '';
  return { metadata: next, changed };
}

async function snapshotHistoryLoadSyncedMetadata(tags) {
  const metadataState = await snapshotHistoryLoadMetadata();
  const synced = snapshotHistoryReconcileMetadata(tags, metadataState.metadata);

  if (synced.changed) {
    await snapshotHistorySaveMetadata(metadataState, synced.metadata);
  }

  return {
    ...metadataState,
    metadata: synced.metadata,
    warning:
      metadataState.warning ||
      (synced.changed ? 'Snapshot registry synchronized with live Git tags.' : '')
  };
}

function snapshotHistoryRemoveSnapshot(metadata, tagName) {
  const next = snapshotHistoryNormalizeMetadata(metadata);
  if (next.snapshots[tagName]) {
    delete next.snapshots[tagName];
    next.updatedAt = new Date().toISOString();
  }
  return next;
}
`;

js = replaceRequired(
  js,
  /function snapshotHistoryMetadataEntry\(metadata, tagName\) \{[\s\S]*?\n\}\n\nfunction snapshotHistoryDisplayName\(tag, metadata\) \{[\s\S]*?\n\}/,
  registryHelpers,
  'snapshot registry reconcile helpers'
);

const setNameFunction = `function snapshotHistorySetSnapshotName(metadata, tagOrName, name) {
  const tag = typeof tagOrName === 'string' ? { name: tagOrName } : tagOrName;
  const tagName = tag && tag.name ? tag.name : '';
  const clean = snapshotHistoryValidateName(name);
  const next = snapshotHistoryNormalizeMetadata(metadata);
  const existing = next.snapshots[tagName] || {};
  const base = snapshotHistoryRegistryEntry(tag, existing);
  const note = String(existing.note || '').trim();

  next.snapshots[tagName] = {
    ...base,
    ...(clean ? { name: clean } : {}),
    ...(note ? { note } : {}),
    updatedAt: new Date().toISOString()
  };

  if (!clean) delete next.snapshots[tagName].name;
  next.updatedAt = new Date().toISOString();

  return next;
}
`;

js = replaceRequired(
  js,
  /function snapshotHistorySetSnapshotName\(metadata, tagName, name\) \{[\s\S]*?\n\}/,
  setNameFunction,
  'snapshot rename keeps registry entry'
);

// -----------------------------------------------------------------------------
// Metadata load/save remains on gitcms-metadata; ensure save normalizes registry.
// -----------------------------------------------------------------------------
js = js.replace(
  /const clean = snapshotHistoryNormalizeMetadata\(metadata\);\n  const content = JSON\.stringify\(clean, null, 2\) \+ '\\n';/,
  "const clean = snapshotHistoryNormalizeMetadata(metadata);\n  clean.updatedAt = clean.updatedAt || new Date().toISOString();\n  const content = JSON.stringify(clean, null, 2) + '\\n';"
);

// -----------------------------------------------------------------------------
// Rename: sync registry first, then rename one live entry.
// -----------------------------------------------------------------------------
const renameFunction = `async function snapshotHistoryRename(tag) {
  if (!snapshotHistoryRequireConnection()) return;
  if (!tag || !tag.name || !tag.name.startsWith(SNAPSHOT_HISTORY_PREFIX)) {
    snapshotHistorySetErr('Only snapshot-* tags can be renamed here.');
    return;
  }

  snapshotHistorySetErr('');
  snapshotHistorySetWarn('Loading snapshot registry…');

  try {
    const tags = await snapshotHistoryListTags();
    const liveTag = tags.find((candidate) => candidate.name === tag.name) || tag;
    const metadataState = await snapshotHistoryLoadSyncedMetadata(tags);
    const currentName = snapshotHistoryDisplayName(liveTag, metadataState.metadata);
    const nextName = window.prompt(
      'Snapshot name. Leave empty to clear the custom name.',
      currentName || ''
    );

    if (nextName === null) {
      snapshotHistorySetWarn('');
      return;
    }

    const nextMetadata = snapshotHistorySetSnapshotName(metadataState.metadata, liveTag, nextName);
    snapshotHistorySetWarn('Saving snapshot registry…');
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
`;

js = replaceRequired(
  js,
  /async function snapshotHistoryRename\(tag\) \{[\s\S]*?\n\}\n\nasync function snapshotHistoryDelete/,
  renameFunction + '\nasync function snapshotHistoryDelete',
  'rename updates synchronized snapshot registry'
);

// -----------------------------------------------------------------------------
// Delete: delete tag then remove registry entry immediately.
// -----------------------------------------------------------------------------
const deleteFunction = `async function snapshotHistoryDelete(tag) {
  if (!snapshotHistoryRequireConnection()) return;
  if (!tag || !tag.name || !tag.name.startsWith(SNAPSHOT_HISTORY_PREFIX)) {
    snapshotHistorySetErr('Only snapshot-* tags can be deleted here.');
    return;
  }

  const ok = confirm(
    'Delete snapshot tag ' +
      tag.name +
      '?\\n\\nThis deletes only the Git tag and its snapshot registry entry.\\nIt does not change content or main.'
  );
  if (!ok) return;

  snapshotHistorySetErr('');
  snapshotHistorySetWarn('Deleting snapshot tag…');

  try {
    await GitHubApi.request(GitHubApi.repoPath('/git/refs/tags/' + encodeURIComponent(tag.name)), {
      method: 'DELETE'
    });

    try {
      const metadataState = await snapshotHistoryLoadMetadata();
      const nextMetadata = snapshotHistoryRemoveSnapshot(metadataState.metadata, tag.name);
      await snapshotHistorySaveMetadata(metadataState, nextMetadata);
    } catch (metadataError) {
      console.warn('Snapshot tag deleted, but registry cleanup failed', metadataError);
      snapshotHistorySetWarn(
        'Snapshot tag deleted, but registry cleanup failed. Refresh History to reconcile.'
      );
    }

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
`;

js = replaceRequired(
  js,
  /async function snapshotHistoryDelete\(tag\) \{[\s\S]*?\n\}\n\nfunction snapshotHistoryRender/,
  deleteFunction + '\nfunction snapshotHistoryRender',
  'delete removes snapshot registry entry'
);

// -----------------------------------------------------------------------------
// Refresh: fetch live tags, reconcile registry, then render.
// -----------------------------------------------------------------------------
const refreshFunction = `async function snapshotHistoryRefresh() {
  ensureSnapshotHistoryModal();
  snapshotHistorySetErr('');
  if (!snapshotHistoryRequireConnection()) return;

  snapshotHistorySetWarn('Loading snapshot tags…');

  try {
    const tags = await snapshotHistoryListTags();
    const metadataState = await snapshotHistoryLoadSyncedMetadata(tags);

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
`;

js = replaceRequired(
  js,
  /async function snapshotHistoryRefresh\(\) \{[\s\S]*?\n\}\n\nasync function snapshotHistoryRefreshEditorAfterRollback/,
  refreshFunction + '\nasync function snapshotHistoryRefreshEditorAfterRollback',
  'history refresh reconciles snapshot registry'
);

// -----------------------------------------------------------------------------
// Documentation copy in modal.
// -----------------------------------------------------------------------------
js = js.replace(
  /Custom snapshot names are stored in <code>\$\{esc\(SNAPSHOT_METADATA_PATH\)\}<\/code> on(?:\s|\n)*the <code>\$\{esc\(SNAPSHOT_METADATA_BRANCH\)\}<\/code> metadata branch\. Git tag names stay unchanged\./,
  'Snapshot registry metadata is stored in <code>${esc(SNAPSHOT_METADATA_PATH)}</code> on the <code>${esc(SNAPSHOT_METADATA_BRANCH)}</code> metadata branch. Git tag names stay unchanged.'
);

write(JS_PATH, js);

// -----------------------------------------------------------------------------
// Versions.
// -----------------------------------------------------------------------------
if (existsSync(PACKAGE_PATH)) {
  const pkg = JSON.parse(read(PACKAGE_PATH));
  pkg.version = VERSION;
  write(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + '\n');
}

updateVersionInFile('src/js/00-core.js');
updateVersionInFile('src/admin.js');
updateVersionInFile('src/js/17-backup.js');

// -----------------------------------------------------------------------------
// Tests.
// -----------------------------------------------------------------------------
const namedTests = `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snapshot history stores human-readable names as metadata, not tag renames', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /const SNAPSHOT_METADATA_PATH = '\\\\.gitcms\\\\/snapshots\\\\.json'/);
  assert.match(js, /const SNAPSHOT_METADATA_BRANCH = 'gitcms-metadata'/);
  assert.match(js, /function snapshotHistoryDisplayName\\(tag, metadata\\)/);
  assert.match(js, /async function snapshotHistoryLoadMetadata\\(\\)/);
  assert.match(js, /async function snapshotHistorySaveMetadata\\(metadataState, metadata\\)/);
  assert.match(js, /async function snapshotHistoryRename\\(tag\\)/);
  assert.match(js, /data-action="rename"/);
  assert.match(js, /snapshotHistoryRename\\(tag\\)/);
  assert.match(js, /Git tag names stay unchanged/);
});

test('snapshot registry contains all live snapshot tags and removes stale entries', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /function snapshotHistoryReconcileMetadata\\(tags, metadata\\)/);
  assert.match(js, /const liveTags = new Set\\(\\)/);
  assert.match(js, /next\\.snapshots\\[tag\\.name\\] = entry/);
  assert.match(js, /if \\(!liveTags\\.has\\(oldTag\\)\\) changed = true/);
  assert.match(js, /async function snapshotHistoryLoadSyncedMetadata\\(tags\\)/);
});

test('snapshot history refresh synchronizes registry before rendering', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');
  const refreshStart = js.indexOf('async function snapshotHistoryRefresh');
  const refreshEnd = js.indexOf('async function snapshotHistoryRefreshEditorAfterRollback', refreshStart);
  const refreshBody = js.slice(refreshStart, refreshEnd);

  assert.match(refreshBody, /const tags = await snapshotHistoryListTags\\(\\)/);
  assert.match(refreshBody, /snapshotHistoryLoadSyncedMetadata\\(tags\\)/);
  assert.match(refreshBody, /snapshotHistoryRender\\(tags, metadataState\\.metadata\\)/);
});

test('snapshot rename updates registry entry without renaming Git tag', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');
  const renameStart = js.indexOf('async function snapshotHistoryRename');
  const renameEnd = js.indexOf('async function snapshotHistoryDelete', renameStart);
  const renameBody = js.slice(renameStart, renameEnd);

  assert.match(renameBody, /snapshotHistoryLoadSyncedMetadata\\(tags\\)/);
  assert.match(renameBody, /snapshotHistorySetSnapshotName/);
  assert.match(renameBody, /snapshotHistorySaveMetadata/);
  assert.doesNotMatch(renameBody, /\\/git\\/refs\\/tags/);
  assert.doesNotMatch(renameBody, /updateRef/);
});

test('snapshot delete removes both Git tag and registry entry without changing branches', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');
  const deleteStart = js.indexOf('async function snapshotHistoryDelete');
  const deleteEnd = js.indexOf('function snapshotHistoryRender', deleteStart);
  const deleteBody = js.slice(deleteStart, deleteEnd);

  assert.match(deleteBody, /\\/git\\/refs\\/tags/);
  assert.match(deleteBody, /method: 'DELETE'/);
  assert.match(deleteBody, /snapshotHistoryRemoveSnapshot/);
  assert.match(deleteBody, /snapshotHistorySaveMetadata/);
  assert.doesNotMatch(deleteBody, /updateRef/);
});

test('snapshot metadata validation keeps names plain and bounded', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /const SNAPSHOT_NAME_MAX_LENGTH = 80/);
  assert.match(js, /function snapshotHistoryValidateName\\(name\\)/);
  assert.match(js, /\\[<>\\]/);
  assert.match(js, /Snapshot names must be plain text/);
});

test('snapshot metadata branch is created as metadata-only root commit', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');
  const createStart = js.indexOf('async function snapshotHistoryCreateMetadataOnlyBranch');
  const ensureStart = js.indexOf('async function snapshotHistoryEnsureMetadataBranch');
  const createBody = js.slice(createStart, ensureStart);

  assert.match(createBody, /\\/git\\/blobs/);
  assert.match(createBody, /\\/git\\/trees/);
  assert.match(createBody, /\\/git\\/commits/);
  assert.match(createBody, /refs\\/heads\\/.*SNAPSHOT_METADATA_BRANCH/);
  assert.match(createBody, /path:\\s*SNAPSHOT_METADATA_PATH/);
  assert.doesNotMatch(createBody, /createBranchFromSha\\(SNAPSHOT_METADATA_BRANCH/);
});

test('README documents named snapshot registry', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Named snapshots/);
  assert.match(readme, /snapshot registry/i);
  assert.match(readme, /gitcms-metadata/);
  assert.match(readme, /\\.gitcms\\/snapshots\\.json/);
  assert.match(readme, /Git tag names stay unchanged/);
});
`;

write(TEST_PATH, namedTests);

// -----------------------------------------------------------------------------
// README.
// -----------------------------------------------------------------------------
if (existsSync(README_PATH)) {
  let readme = read(README_PATH);

  readme = readme.replace(/Current version:\s*`[^`]+`\.?/, 'Current version: `' + VERSION + '`.');

  if (!readme.includes('## Named snapshots')) {
    readme += '\n\n## Named snapshots\n\n';
  }

  if (!readme.includes('Snapshot registry synchronization')) {
    readme = readme.replace(/\s*$/, '') + `

### Snapshot registry synchronization

Named snapshots use a synchronized registry stored at:

\`\`\`txt
.gitcms/snapshots.json
\`\`\`

The registry lives on the internal \`gitcms-metadata\` branch. Git tag names stay unchanged.

The live \`snapshot-*\` Git tags remain the source of truth for whether a snapshot exists. The registry stores display metadata for those tags: name, SHA, raw SHA, object type, created date, updated date, and future note/export fields.

History refresh reconciles the registry against live Git tags:

- new \`snapshot-*\` tags are added to \`.gitcms/snapshots.json\`
- deleted tags are removed from \`.gitcms/snapshots.json\`
- renamed snapshots update only their registry entry
- rollback never edits the registry branch
- delete removes the Git tag and the registry entry

The \`gitcms-metadata\` branch is metadata-only and should contain only \`.gitcms/snapshots.json\`.
`;
  }

  write(README_PATH, readme);
}

console.log('');
console.log('Snapshot registry sync patch applied.');
console.log('');
console.log('Now run:');
console.log('  npm run build');
console.log('  npm test');
console.log('  npm run quality');
console.log('');
console.log('Then commit:');
console.log('  git add -A');
console.log('  git commit -m "Synchronize snapshot metadata registry"');
console.log('  git push');
