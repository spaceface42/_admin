#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.79-history-index-html-fix';

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

function findDivBlockEnd(html, divStart) {
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = divStart;
  let depth = 0;

  for (let m; (m = tagRe.exec(html)); ) {
    const tag = m[0];
    if (/^<div\b/i.test(tag)) depth++;
    if (/^<\/div/i.test(tag)) {
      depth--;
      if (depth === 0) return tagRe.lastIndex;
    }
  }

  return -1;
}

function removeSnapshotHistoryBlocks(html) {
  // Remove marker-based blocks first. This catches malformed previous inserts at
  // the end of the document as well as correct inserts before Backup.
  while (html.includes('<!-- SNAPSHOT HISTORY -->')) {
    const start = html.indexOf('<!-- SNAPSHOT HISTORY -->');
    const searchAfter = start + '<!-- SNAPSHOT HISTORY -->'.length;
    const nextMarkers = [
      '<!-- BACKUP MODAL -->',
      '<!-- COMMIT MODAL -->',
      '<!-- PUBLISH MODAL -->',
      '<div id="toast"',
      '</body>'
    ]
      .map((marker) => html.indexOf(marker, searchAfter))
      .filter((idx) => idx !== -1)
      .sort((a, b) => a - b);

    if (!nextMarkers.length) break;
    const end = nextMarkers[0];
    html = html.slice(0, start) + html.slice(end);
  }

  // Remove any remaining modal div that has the snapshotHistoryModal id, even if
  // the comment marker is missing.
  while (html.includes('id="snapshotHistoryModal"') || html.includes("id='snapshotHistoryModal'")) {
    const idIdx = (() => {
      const a = html.indexOf('id="snapshotHistoryModal"');
      const b = html.indexOf("id='snapshotHistoryModal'");
      if (a === -1) return b;
      if (b === -1) return a;
      return Math.min(a, b);
    })();

    const divStart = html.lastIndexOf('<div', idIdx);
    if (divStart === -1) break;

    const commentStart = html.lastIndexOf('<!-- SNAPSHOT HISTORY -->', divStart);
    const start = commentStart !== -1 && divStart - commentStart < 300 ? commentStart : divStart;
    const end = findDivBlockEnd(html, divStart);

    if (end === -1) {
      // Fallback for malformed trailing insert: cut until the next safe structural marker.
      const candidates = ['<!-- BACKUP MODAL -->', '<!-- COMMIT MODAL -->', '<!-- PUBLISH MODAL -->', '<div id="toast"', '</body>']
        .map((marker) => html.indexOf(marker, divStart))
        .filter((idx) => idx !== -1)
        .sort((a, b) => a - b);
      if (!candidates.length) break;
      html = html.slice(0, start) + html.slice(candidates[0]);
    } else {
      html = html.slice(0, start) + html.slice(end);
    }
  }

  return html;
}

function ensureHistoryButton(html) {
  if (!html.includes('id="snapshotHistoryBtn"')) {
    const historyButton = `
        <button
          class="tbtn ghost"
          id="snapshotHistoryBtn"
          title="List snapshot tags and rollback"
          onclick="openSnapshotHistory(); return false;"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12a9 9 0 109-9" />
            <path d="M3 3v6h6" />
            <path d="M12 7v5l3 3" />
          </svg>
          History
        </button>
`;
    const marker = '<button class="tbtn ghost" id="diagnosticsBtn"';
    if (!html.includes(marker)) throw new Error('Could not find diagnostics button insertion point.');
    return html.replace(marker, historyButton + marker);
  }

  // Add inline fallback to the existing source button.
  return html.replace(
    /<button([^>]*\bid=["']snapshotHistoryBtn["'][^>]*)>/,
    (full, attrs) => {
      if (/\bonclick=/.test(attrs)) return full;
      return `<button${attrs} onclick="openSnapshotHistory(); return false;">`;
    }
  );
}

function snapshotHistoryModalMarkup() {
  return `
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

        <div class="modal-warn" id="snapshotHistoryWarn"></div>
        <div class="modal-err" id="snapshotHistoryErr"></div>
        <div class="media-grid" id="snapshotHistoryList">
          <div class="media-empty">Open History to load snapshots.</div>
        </div>

        <div class="modal-row">
          <button class="tbtn" type="button" id="snapshotHistoryCloseBtn">Close</button>
        </div>
      </div>
    </div>
`;
}

function patchIndex() {
  const path = 'src/index.html';
  let html = read(path);

  html = removeSnapshotHistoryBlocks(html);
  html = ensureHistoryButton(html);

  const backupMarker = '    <!-- BACKUP MODAL -->';
  if (!html.includes(backupMarker)) throw new Error('Could not find BACKUP MODAL marker.');
  html = html.replace(backupMarker, `${snapshotHistoryModalMarkup()}\n${backupMarker}`);

  write(path, html);
}

function patchSnapshotHistoryJs() {
  const path = 'src/js/18-snapshot-history.js';
  if (!existsSync(path)) throw new Error('src/js/18-snapshot-history.js not found.');

  let js = read(path);

  if (!js.includes('window.openSnapshotHistory = openSnapshotHistory;')) {
    js = js.replace(
      /function setupSnapshotHistory\(\) \{/,
      `window.openSnapshotHistory = openSnapshotHistory;\n\nfunction setupSnapshotHistory() {`
    );
  }

  if (!js.includes("btn.setAttribute('onclick', 'openSnapshotHistory(); return false;');")) {
    js = js.replace(
      /btn\.title = 'List snapshot tags and rollback';/,
      `btn.title = 'List snapshot tags and rollback';
  btn.setAttribute('onclick', 'openSnapshotHistory(); return false;');`
    );
  }

  // Avoid duplicate modal creation during startup.
  js = js.replace(
    /function setupSnapshotHistory\(\) \{\s*const btn = ensureSnapshotHistoryButton\(\);\s*ensureSnapshotHistoryModal\(\);/,
    `function setupSnapshotHistory() {
  const btn = ensureSnapshotHistoryButton();`
  );

  write(path, js);
}

function writeTests() {
  write(
    'tests/snapshot-history-index-validity.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snapshot history modal appears exactly once in source HTML before Backup modal', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

  const ids = [...html.matchAll(/id=["']snapshotHistoryModal["']/g)];
  assert.equal(ids.length, 1);

  const historyIdx = html.indexOf('id="snapshotHistoryModal"');
  const backupIdx = html.indexOf('<!-- BACKUP MODAL -->');

  assert.notEqual(historyIdx, -1);
  assert.notEqual(backupIdx, -1);
  assert.ok(historyIdx < backupIdx);

  assert.match(html, /<div class=["']modal-bg["'] id=["']snapshotHistoryModal["']/);
  assert.match(html, /<div class=["']modal media-modal["']>/);
});

test('snapshot history button has inline fallback and JS exposes global opener', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(html, /id=["']snapshotHistoryBtn["'][^>]*onclick=["']openSnapshotHistory\\(\\); return false;["']/);
  assert.match(js, /window\\.openSnapshotHistory = openSnapshotHistory/);
});
`
  );
}

updateVersion();
patchIndex();
patchSnapshotHistoryJs();
writeTests();

console.log(`Applied ${VERSION}.`);
console.log('Fixed malformed src/index.html by removing duplicate/broken Snapshot History modal blocks and reinserting one valid modal before Backup.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
