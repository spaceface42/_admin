#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = '1.1.92-snapshot-create-registry-sync';
const SNAPSHOT_JS = 'src/js/18-snapshot-history.js';
const TEST_PATH = 'tests/snapshot-registry-create-sync.test.mjs';
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
  if (next === source) throw new Error('No replacement matched for ' + label);
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

if (!existsSync(SNAPSHOT_JS)) {
  throw new Error('Run this from the _admin repo root. Missing ' + SNAPSHOT_JS);
}

// -----------------------------------------------------------------------------
// 1. Expose a safe registry sync function for publish-time snapshot creation.
// -----------------------------------------------------------------------------
let snapshotJs = read(SNAPSHOT_JS);

const syncFunction = `async function snapshotHistorySyncRegistry() {
  if (!snapshotHistoryConnected()) return null;

  const tags = await snapshotHistoryListTags();
  return snapshotHistoryLoadSyncedMetadata(tags);
}

async function snapshotHistorySyncRegistryAfterSnapshotCreate() {
  try {
    await snapshotHistorySyncRegistry();
  } catch (e) {
    // Snapshot creation must not fail because registry metadata sync failed.
    // Opening History later will reconcile the registry against live snapshot tags.
    console.warn('Snapshot registry sync after snapshot creation failed', e);
  }
}

`;

if (!snapshotJs.includes('async function snapshotHistorySyncRegistry()')) {
  snapshotJs = replaceRequired(
    snapshotJs,
    /async function snapshotHistoryRefresh\(\) \{/,
    syncFunction + 'async function snapshotHistoryRefresh() {',
    'publish-time registry sync functions'
  );
}

if (!snapshotJs.includes('window.GitCMSSnapshotRegistry')) {
  const exportBlock = `window.GitCMSSnapshotRegistry = Object.freeze({
  sync: snapshotHistorySyncRegistry,
  syncAfterSnapshotCreate: snapshotHistorySyncRegistryAfterSnapshotCreate
});

`;

  if (snapshotJs.includes('window.openSnapshotHistory = openSnapshotHistory;')) {
    snapshotJs = replaceRequired(
      snapshotJs,
      /window\.openSnapshotHistory = openSnapshotHistory;/,
      exportBlock + 'window.openSnapshotHistory = openSnapshotHistory;',
      'snapshot registry window export'
    );
  } else {
    snapshotJs += '\\n' + exportBlock;
    console.log('added snapshot registry window export at EOF');
  }
}

write(SNAPSHOT_JS, snapshotJs);

// -----------------------------------------------------------------------------
// 2. Add a publish-side helper and call it after snapshot tag creation.
//    This is intentionally pattern-based because publish file names changed over
//    this project. The script looks for the JS module that creates snapshot tags.
// -----------------------------------------------------------------------------
const jsDir = 'src/js';
const jsFiles = readdirSync(jsDir)
  .filter((name) => /^\\d+-.+\\.js$/.test(name))
  .map((name) => join(jsDir, name));

let publishPath = '';
let publishJs = '';

for (const file of jsFiles) {
  const text = read(file);
  if (
    file !== SNAPSHOT_JS &&
    /snapshot-/i.test(text) &&
    /refs\\/tags|git\\/refs|createRef|createTag|snapshot tag/i.test(text) &&
    /publish|doPublish|Published|cms: publish/i.test(text)
  ) {
    publishPath = file;
    publishJs = text;
    break;
  }
}

if (!publishPath) {
  throw new Error(
    'Could not find publish module that creates snapshot tags. Run: grep -R \"snapshot-\\\\|refs/tags\\\\|createRef\" src/js'
  );
}

if (!publishJs.includes('syncSnapshotRegistryAfterSnapshotCreate')) {
  const helper = `async function syncSnapshotRegistryAfterSnapshotCreate() {
  try {
    if (
      window.GitCMSSnapshotRegistry &&
      typeof window.GitCMSSnapshotRegistry.syncAfterSnapshotCreate === 'function'
    ) {
      await window.GitCMSSnapshotRegistry.syncAfterSnapshotCreate();
    }
  } catch (e) {
    console.warn('Snapshot registry sync hook failed', e);
  }
}

`;
  publishJs = helper + publishJs;
  console.log('added publish helper to ' + publishPath);
}

if (!publishJs.includes('syncSnapshotRegistryAfterSnapshotCreate();')) {
  const lines = publishJs.split('\\n');
  let inserted = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Common direct pattern: awaiting GitHub ref/tag creation.
    const directCreate =
      /await\\s+GitHubApi\\.(request|createRef)\\b/.test(line) &&
      /refs\\/tags|refs\\/tags|git\\/refs|ref:\\s*['"`]refs\\/tags/.test(
        lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 8)).join('\\n')
      );

    // Common wrapper pattern: awaiting a helper whose name contains snapshot.
    const wrapperCreate = /await\\s+[^;]*snapshot[^;]*\\(/i.test(line);

    if ((directCreate || wrapperCreate) && !/syncSnapshotRegistryAfterSnapshotCreate/.test(line)) {
      const indent = line.match(/^\\s*/)?.[0] || '';
      lines.splice(i + 1, 0, indent + 'await syncSnapshotRegistryAfterSnapshotCreate();');
      inserted = true;
      console.log('inserted registry sync after snapshot creation in ' + publishPath + ' at line ' + (i + 2));
      break;
    }
  }

  if (!inserted) {
    throw new Error(
      'Found publish module ' +
        publishPath +
        ', but could not locate the awaited snapshot creation line. Inspect it manually and add: await syncSnapshotRegistryAfterSnapshotCreate(); after snapshot tag creation.'
    );
  }

  publishJs = lines.join('\\n');
}

write(publishPath, publishJs);

// -----------------------------------------------------------------------------
// 3. Version alignment.
// -----------------------------------------------------------------------------
if (existsSync(PACKAGE_PATH)) {
  const pkg = JSON.parse(read(PACKAGE_PATH));
  pkg.version = VERSION;
  write(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + '\\n');
}

updateVersionInFile('src/js/00-core.js');
updateVersionInFile('src/admin.js');
updateVersionInFile('src/js/17-backup.js');

// -----------------------------------------------------------------------------
// 4. Tests.
// -----------------------------------------------------------------------------
const test = `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

test('snapshot registry exposes publish-time sync hook', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /async function snapshotHistorySyncRegistry\\(\\)/);
  assert.match(js, /async function snapshotHistorySyncRegistryAfterSnapshotCreate\\(\\)/);
  assert.match(js, /snapshotHistoryLoadSyncedMetadata\\(tags\\)/);
  assert.match(js, /window\\.GitCMSSnapshotRegistry/);
  assert.match(js, /syncAfterSnapshotCreate: snapshotHistorySyncRegistryAfterSnapshotCreate/);
});

test('publish path syncs snapshot registry after creating snapshot tag', () => {
  const dir = new URL('../src/js/', import.meta.url);
  const files = readdirSync(dir)
    .filter((name) => /^\\d+-.+\\.js$/.test(name))
    .map((name) => [name, readFileSync(new URL(name, dir), 'utf8')]);

  const publish = files.find(
    ([name, text]) =>
      name !== '18-snapshot-history.js' &&
      /syncSnapshotRegistryAfterSnapshotCreate/.test(text) &&
      /snapshot-/i.test(text)
  );

  assert.ok(publish, 'Expected a publish module with snapshot registry sync hook');

  const [, text] = publish;
  assert.match(text, /async function syncSnapshotRegistryAfterSnapshotCreate\\(\\)/);
  assert.match(text, /GitCMSSnapshotRegistry\\.syncAfterSnapshotCreate/);
  assert.match(text, /await syncSnapshotRegistryAfterSnapshotCreate\\(\\)/);
});
`;

write(TEST_PATH, test);

// -----------------------------------------------------------------------------
// 5. README.
// -----------------------------------------------------------------------------
if (existsSync(README_PATH)) {
  let readme = read(README_PATH);
  readme = readme.replace(/Current version:\\s*`[^`]+`\\.?/, 'Current version: `' + VERSION + '`.');

  if (!readme.includes('Publish-time snapshot registry sync')) {
    readme = readme.replace(/\\s*$/, '') + `

### Publish-time snapshot registry sync

When publish creates a new \`snapshot-*\` Git tag, the admin immediately synchronizes the snapshot registry in \`.gitcms/snapshots.json\` on the \`gitcms-metadata\` branch.

History refresh still performs full reconciliation, so if publish-time registry sync fails because of a transient GitHub/API/cache issue, opening History later adds missing tags and removes stale deleted tags.
`;
  }

  write(README_PATH, readme);
}

console.log('');
console.log('Snapshot create registry sync patch applied.');
console.log('');
console.log('Patched publish module: ' + publishPath);
console.log('');
console.log('Now run:');
console.log('  npm run build');
console.log('  npm test');
console.log('  npm run quality');
console.log('');
console.log('Then commit:');
console.log('  git add -A');
console.log('  git commit -m "Sync snapshot registry after snapshot creation"');
console.log('  git push');
