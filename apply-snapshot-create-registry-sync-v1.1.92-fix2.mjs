#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = '1.1.92-snapshot-create-registry-sync';
const SNAPSHOT_JS = 'src/js/18-snapshot-history.js';
const CREATE_SYNC_TEST = 'tests/snapshot-registry-create-sync.test.mjs';
const PACKAGE_PATH = 'package.json';
const README_PATH = 'README.md';

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

function updateVersion(path) {
  if (!existsSync(path)) return;
  let text = read(path);
  text = text.replace(/GITCMS_VERSION\s*=\s*['"][^'"]+['"]/, "GITCMS_VERSION = '" + VERSION + "'");
  text = text.replace(/version:\s*['"][^'"]+['"]/, "version: '" + VERSION + "'");
  write(path, text);
}

if (!existsSync(SNAPSHOT_JS)) {
  throw new Error('Run from _admin repo root. Missing ' + SNAPSHOT_JS);
}

// -----------------------------------------------------------------------------
// 1. Ensure snapshot-history exposes a sync hook.
// -----------------------------------------------------------------------------
let snapshotJs = read(SNAPSHOT_JS);

if (!snapshotJs.includes('async function snapshotHistorySyncRegistry()')) {
  const syncFunctions = `async function snapshotHistorySyncRegistry() {
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

  snapshotJs = replaceRequired(
    snapshotJs,
    /async function snapshotHistoryRefresh\(\) \{/,
    syncFunctions + 'async function snapshotHistoryRefresh() {',
    'snapshot registry sync functions'
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
      'window GitCMSSnapshotRegistry export'
    );
  } else {
    snapshotJs += '\n' + exportBlock;
    console.log('added window GitCMSSnapshotRegistry export at EOF');
  }
}

write(SNAPSHOT_JS, snapshotJs);

// -----------------------------------------------------------------------------
// 2. Find and patch the publish module.
// -----------------------------------------------------------------------------
const jsDir = 'src/js';
const jsFiles = readdirSync(jsDir)
  .filter((name) => /^\d+-.+\.js$/.test(name))
  .map((name) => join(jsDir, name));

const candidates = jsFiles
  .filter((file) => file !== SNAPSHOT_JS)
  .map((file) => [file, read(file)])
  .filter(([file, text]) => {
    const lower = text.toLowerCase();
    return (
      lower.includes('publish') &&
      lower.includes('snapshot') &&
      (text.includes('refs/tags') ||
        text.includes('/git/refs') ||
        text.includes('createRef') ||
        /create\w*Snapshot\w*\(/i.test(text) ||
        /snapshot\w*Tag\w*\(/i.test(text))
    );
  });

if (!candidates.length) {
  console.error('Could not detect publish module automatically.');
  console.error('Relevant grep command: grep -R "snapshot-\\|refs/tags\\|createRef\\|doPublish" src/js');
  throw new Error('No publish module candidate found.');
}

let patchedPath = '';
let patchedText = '';

for (const [file, original] of candidates) {
  let text = original;

  if (!text.includes('async function syncSnapshotRegistryAfterSnapshotCreate()')) {
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
    text = helper + text;
  }

  if (text.includes('await syncSnapshotRegistryAfterSnapshotCreate();')) {
    patchedPath = file;
    patchedText = text;
    break;
  }

  const replacements = [
    {
      label: 'await create*Snapshot* call',
      pattern: /(await\s+[\w.]*create\w*Snapshot\w*\([\s\S]*?\);\n)/i,
      replacement: '$1  await syncSnapshotRegistryAfterSnapshotCreate();\n'
    },
    {
      label: 'await snapshot*Tag* call',
      pattern: /(await\s+[\w.]*snapshot\w*Tag\w*\([\s\S]*?\);\n)/i,
      replacement: '$1  await syncSnapshotRegistryAfterSnapshotCreate();\n'
    },
    {
      label: 'GitHubApi createRef refs/tags call',
      pattern:
        /(await\s+GitHubApi\.(?:request|createRef)\([\s\S]{0,1400}?(?:refs\/tags|ref:\s*['"`]refs\/tags)[\s\S]*?\);\n)/i,
      replacement: '$1  await syncSnapshotRegistryAfterSnapshotCreate();\n'
    }
  ];

  for (const item of replacements) {
    const next = text.replace(item.pattern, item.replacement);
    if (next !== text) {
      console.log('patched ' + item.label + ' in ' + file);
      text = next;
      patchedPath = file;
      patchedText = text;
      break;
    }
  }

  if (patchedPath) break;
}

if (!patchedPath) {
  console.error('Publish candidates were:');
  for (const [file] of candidates) console.error('  ' + file);
  throw new Error(
    'Could not insert registry sync automatically. Add `await syncSnapshotRegistryAfterSnapshotCreate();` immediately after snapshot tag creation.'
  );
}

write(patchedPath, patchedText);

// -----------------------------------------------------------------------------
// 3. Fix/replace the create-sync test. The earlier test had an unescaped regex.
// -----------------------------------------------------------------------------
const createSyncTest = `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('snapshot registry exposes publish-time sync hook', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /async function snapshotHistorySyncRegistry\(\)/);
  assert.match(js, /async function snapshotHistorySyncRegistryAfterSnapshotCreate\(\)/);
  assert.match(js, /snapshotHistoryLoadSyncedMetadata\(tags\)/);
  assert.match(js, /window\.GitCMSSnapshotRegistry/);
  assert.match(js, /syncAfterSnapshotCreate: snapshotHistorySyncRegistryAfterSnapshotCreate/);
});

test('publish path syncs snapshot registry after creating snapshot tag', () => {
  const dir = new URL('../src/js/', import.meta.url);
  const files = readdirSync(dir)
    .filter((name) => /^\d+-.+\.js$/.test(name))
    .map((name) => [name, readFileSync(new URL(name, dir), 'utf8')]);

  const publish = files.find(
    ([name, text]) =>
      name !== '18-snapshot-history.js' &&
      /async function syncSnapshotRegistryAfterSnapshotCreate\(\)/.test(text) &&
      /GitCMSSnapshotRegistry\.syncAfterSnapshotCreate/.test(text) &&
      /await syncSnapshotRegistryAfterSnapshotCreate\(\)/.test(text)
  );

  assert.ok(publish, 'Expected a publish module with snapshot registry sync hook');
});
`;

write(CREATE_SYNC_TEST, createSyncTest);

// -----------------------------------------------------------------------------
// 4. Version/doc alignment.
// -----------------------------------------------------------------------------
if (existsSync(PACKAGE_PATH)) {
  const pkg = JSON.parse(read(PACKAGE_PATH));
  pkg.version = VERSION;
  write(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + '\n');
}

updateVersion('src/js/00-core.js');
updateVersion('src/admin.js');
updateVersion('src/js/17-backup.js');

if (existsSync(README_PATH)) {
  let readme = read(README_PATH);
  readme = readme.replace(/Current version:\s*`[^`]+`\.?/, 'Current version: `' + VERSION + '`.');
  if (!readme.includes('Publish-time snapshot registry sync')) {
    readme =
      readme.replace(/\s*$/, '') +
      `

### Publish-time snapshot registry sync

When publish creates a new \`snapshot-*\` Git tag, the admin immediately synchronizes the snapshot registry in \`.gitcms/snapshots.json\` on the \`gitcms-metadata\` branch.

History refresh still performs full reconciliation, so if publish-time registry sync fails because of a transient GitHub/API/cache issue, opening History later adds missing tags and removes stale deleted tags.
`;
  }
  write(README_PATH, readme);
}

console.log('');
console.log('Fixed publish-time snapshot registry sync patch applied.');
console.log('Patched publish module: ' + patchedPath);
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
