#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.78-history-static-modal-fix';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
}

function replaceOrFail(path, pattern, replacement, label) {
  const before = read(path);
  const after = before.replace(pattern, replacement);
  if (after === before) throw new Error(`Could not update ${label} in ${path}`);
  write(path, after);
}

function updateVersion() {
  const pkg = JSON.parse(read('package.json'));
  pkg.version = VERSION;
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

  replaceOrFail(
    'src/js/00-core.js',
    /const\s+GITCMS_VERSION\s*=\s*['"][^'"]+['"];/,
    `const GITCMS_VERSION = '${VERSION}';`,
    'GITCMS_VERSION'
  );

  replaceOrFail(
    'README.md',
    /Current version:\s*```txt\s*[\s\S]*?\s*```/,
    `Current version:\n\n\`\`\`txt\n${VERSION}\n\`\`\``,
    'README current version'
  );

  if (existsSync('src/js/17-backup.js')) {
    replaceOrFail(
      'src/js/17-backup.js',
      /version:\s*['"][^'"]+['"]/,
      `version: '${VERSION}'`,
      'backup metadata version'
    );
  }
}

function patchIndex() {
  const path = 'src/index.html';
  let html = read(path);

  // Make the static topbar button independently callable even if JS binding is delayed/overwritten.
  html = html.replace(
    /<button([^>]*?)id=["']snapshotHistoryBtn["']([^>]*)>/g,
    (m, a, b) => {
      const attrs = `${a} id="snapshotHistoryBtn" ${b}`.replace(/\s+/g, ' ').trim();
      if (/onclick=/.test(attrs)) return `<button ${attrs}>`;
      return `<button ${attrs} onclick="openSnapshotHistory(); return false;">`;
    }
  );

  // Remove any existing static snapshot history modal, even if it was accidentally placed
  // after the generated script in previous patches.
  html = html.replace(
    /\n\s*<!-- SNAPSHOT HISTORY -->\s*<div class=["']modal-bg["'] id=["']snapshotHistoryModal["'][\s\S]*?<\/div>\s*<\/div>\s*/g,
    '\n'
  );
  html = html.replace(
    /\n\s*<!-- SNAPSHOT HISTORY -->\s*<div class=["']modal["'] id=["']snapshotHistoryModal["'][\s\S]*?<\/div>\s*<\/div>\s*/g,
    '\n'
  );

  const modal = `
    <!-- SNAPSHOT HISTORY -->
    <div class="modal-bg" id="snapshotHistoryModal">
      <div class="modal media-modal">
        <h3>Snapshot history</h3>
        <p class="mdesc">
          Snapshot tags are created after publishing. Rollback moves both
          <span class="mono">content</span> and <span class="mono">main</span>
          to the selected snapshot commit. Rollback does not create a new snapshot tag.
        </p>

        <div class="modal-actions" style="justify-content: flex-start; gap: 8px; flex-wrap: wrap">
          <button class="tbtn ghost" type="button" id="snapshotHistoryRefreshBtn">
            Refresh snapshots
          </button>
        </div>

        <div class="media-warn" id="snapshotHistoryWarn"></div>
        <div class="media-err" id="snapshotHistoryErr"></div>
        <div class="media-grid" id="snapshotHistoryList">
          <div class="media-empty">Open History to load snapshots.</div>
        </div>

        <div class="modal-actions">
          <button class="tbtn" type="button" id="snapshotHistoryCloseBtn">Close</button>
        </div>
      </div>
    </div>
`;

  const backupMarker = '<!-- BACKUP MODAL -->';
  if (!html.includes(backupMarker)) {
    throw new Error('Could not find BACKUP MODAL marker to insert Snapshot History before it.');
  }
  html = html.replace(backupMarker, `${modal}\n    ${backupMarker}`);

  write(path, html);
}

function patchSnapshotHistoryJs() {
  const path = 'src/js/18-snapshot-history.js';
  if (!existsSync(path)) throw new Error('src/js/18-snapshot-history.js not found');

  let js = read(path);

  // Ensure runtime-created button also has an inline fallback.
  js = js.replace(
    /btn\.title = 'List snapshot tags and rollback';/,
    `btn.title = 'List snapshot tags and rollback';
  btn.setAttribute('onclick', 'openSnapshotHistory(); return false;');`
  );

  // Expose the opener explicitly for the inline fallback.
  if (!js.includes('window.openSnapshotHistory = openSnapshotHistory;')) {
    js = js.replace(
      /function setupSnapshotHistory\(\) \{/,
      `window.openSnapshotHistory = openSnapshotHistory;

function setupSnapshotHistory() {`
    );
  }

  // Do not create the modal during startup; use the static modal or create on first click.
  js = js.replace(
    /function setupSnapshotHistory\(\) \{\s*const btn = ensureSnapshotHistoryButton\(\);\s*ensureSnapshotHistoryModal\(\);/,
    `function setupSnapshotHistory() {
  const btn = ensureSnapshotHistoryButton();`
  );

  write(path, js);
}

function patchReadme() {
  let readme = read('README.md');

  if (!readme.includes('History button binding fallback')) {
    readme += `

---

## History button binding fallback

The History button has two bindings:

\`\`\`txt
1. normal JS setup/delegated click binding
2. inline onclick fallback calling window.openSnapshotHistory()
\`\`\`

The Snapshot History modal is kept in the static HTML before other modals, not appended
after the generated script. Runtime modal creation remains only as a fallback.
`;
  }

  write('README.md', readme);
}

function writeTests() {
  write(
    'tests/snapshot-history-button-static-fallback.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snapshot history button has inline fallback opener', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

  assert.match(html, /id=["']snapshotHistoryBtn["'][^>]*onclick=["']openSnapshotHistory\\(\\); return false;["']/);
});

test('snapshot history modal is static and placed before backup modal', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

  const historyIdx = html.indexOf('id="snapshotHistoryModal"');
  const backupIdx = html.indexOf('<!-- BACKUP MODAL -->');

  assert.notEqual(historyIdx, -1);
  assert.notEqual(backupIdx, -1);
  assert.ok(historyIdx < backupIdx, 'snapshot history modal should be before backup modal');
  assert.match(html, /<div class=["']modal-bg["'] id=["']snapshotHistoryModal["']/);
  assert.match(html, /<div class=["']modal media-modal["']>/);
});

test('snapshot history exposes openSnapshotHistory globally for fallback onclick', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /window\\.openSnapshotHistory = openSnapshotHistory/);
  assert.match(js, /btn\\.setAttribute\\('onclick', 'openSnapshotHistory\\(\\); return false;'\\)/);
});
`
  );
}

updateVersion();
patchIndex();
patchSnapshotHistoryJs();
patchReadme();
writeTests();

console.log(`Applied ${VERSION}.`);
console.log('History button now has inline onclick fallback and static modal is forced before Backup modal.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
console.log('');
console.log('Manual test: open rebuilt admin.html, connect, click History.');
