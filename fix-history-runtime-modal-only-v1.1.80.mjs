#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.80-history-runtime-modal-only';

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

function removeStaticSnapshotHistoryFromIndex(html) {
  let lines = html.split(/\r?\n/);

  const isSnapshotLine = (line) =>
    line.includes('<!-- SNAPSHOT HISTORY -->') ||
    line.includes('id="snapshotHistoryModal"') ||
    line.includes("id='snapshotHistoryModal'") ||
    line.includes('<h3>Snapshot history</h3>') ||
    line.includes('snapshotHistoryRefreshBtn') ||
    line.includes('snapshotHistoryList') ||
    line.includes('snapshotHistoryCloseBtn') ||
    line.includes('Snapshot tags are created after publishing. Rollback moves both');

  const isSafeNextMarker = (line) =>
    line.includes('<!-- BACKUP MODAL -->') ||
    line.includes('<!-- COMMIT MODAL -->') ||
    line.includes('<!-- PUBLISH MODAL -->') ||
    line.includes('<div id="toast"') ||
    line.includes('</body>');

  let changed = true;
  while (changed) {
    changed = false;
    const hit = lines.findIndex(isSnapshotLine);
    if (hit === -1) break;

    let start = hit;
    for (let i = hit; i >= Math.max(0, hit - 80); i--) {
      if (
        lines[i].includes('<!-- SNAPSHOT HISTORY -->') ||
        lines[i].includes('<div class="modal-bg"') ||
        lines[i].includes("<div class='modal-bg'") ||
        lines[i].includes('<div class="modal"') ||
        lines[i].includes("<div class='modal'")
      ) {
        start = i;
        break;
      }
    }

    let end = lines.length;
    for (let i = hit + 1; i < lines.length; i++) {
      if (isSafeNextMarker(lines[i])) {
        end = i;
        break;
      }
    }

    // Keep the safe marker itself. Remove only the broken Snapshot History block/tail.
    lines.splice(start, Math.max(1, end - start));
    changed = true;
  }

  return lines.join('\n');
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

  return html.replace(
    /<button([^>]*\bid=["']snapshotHistoryBtn["'][^>]*)>/,
    (full, attrs) => {
      if (/\bonclick=/.test(attrs)) return full;
      return `<button${attrs} onclick="openSnapshotHistory(); return false;">`;
    }
  );
}

function patchIndex() {
  const path = 'src/index.html';
  let html = read(path);

  html = removeStaticSnapshotHistoryFromIndex(html);
  html = ensureHistoryButton(html);

  if (html.includes('id="snapshotHistoryModal"')) {
    throw new Error('Static snapshotHistoryModal still exists in src/index.html.');
  }

  write(path, html);
}

function patchSnapshotHistoryJs() {
  const path = 'src/js/18-snapshot-history.js';
  if (!existsSync(path)) throw new Error('src/js/18-snapshot-history.js not found.');

  let js = read(path);

  js = js.replace(/modal\.className = 'modal';/g, "modal.className = 'modal-bg';");
  js = js.replace(/<div class="modal-card wide">/g, '<div class="modal media-modal">');

  if (!js.includes("btn.setAttribute('onclick', 'openSnapshotHistory(); return false;');")) {
    js = js.replace(
      /btn\.title = 'List snapshot tags and rollback';/,
      `btn.title = 'List snapshot tags and rollback';
  btn.setAttribute('onclick', 'openSnapshotHistory(); return false;');`
    );
  }

  if (!js.includes('window.openSnapshotHistory = openSnapshotHistory;')) {
    js = js.replace(
      /function setupSnapshotHistory\(\) \{/,
      `window.openSnapshotHistory = openSnapshotHistory;\n\nfunction setupSnapshotHistory() {`
    );
  }

  // Never create the modal at startup. It is runtime-only on click.
  js = js.replace(
    /function setupSnapshotHistory\(\) \{\s*const btn = ensureSnapshotHistoryButton\(\);\s*ensureSnapshotHistoryModal\(\);/,
    `function setupSnapshotHistory() {
  const btn = ensureSnapshotHistoryButton();`
  );

  write(path, js);
}

function patchReadme() {
  let readme = read('README.md');

  if (!readme.includes('History runtime modal only')) {
    readme += `

---

## History runtime modal only

The Snapshot History modal is not stored as static HTML in \`src/index.html\`.

Reason:

\`\`\`txt
static modal inserts caused duplicate/malformed closing divs
runtime creation avoids index.html parser failures
\`\`\`

The History button has an inline fallback:

\`\`\`html
onclick="openSnapshotHistory(); return false;"
\`\`\`

and \`src/js/18-snapshot-history.js\` exposes:

\`\`\`js
window.openSnapshotHistory = openSnapshotHistory
\`\`\`
`;
  }

  write('README.md', readme);
}

function writeTests() {
  write(
    'tests/snapshot-history-runtime-modal-only.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('src index has no static snapshot history modal', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /id=["']snapshotHistoryModal["']/);
  assert.doesNotMatch(html, /<!-- SNAPSHOT HISTORY -->/);
  assert.match(html, /id=["']snapshotHistoryBtn["'][^>]*onclick=["']openSnapshotHistory\\(\\); return false;["']/);
});

test('snapshot history modal is created at runtime using modal-bg', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /function ensureSnapshotHistoryModal/);
  assert.match(js, /modal\\.className = 'modal-bg'/);
  assert.match(js, /<div class="modal media-modal">/);
  assert.match(js, /document\\.body\\.appendChild\\(modal\\)/);
});

test('snapshot history exposes global opener for inline fallback', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /window\\.openSnapshotHistory = openSnapshotHistory/);
  assert.match(js, /btn\\.setAttribute\\('onclick', 'openSnapshotHistory\\(\\); return false;'\\)/);
});

test('snapshot history setup does not create modal during startup', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');
  const setupStart = js.indexOf('function setupSnapshotHistory()');
  const setupEnd = js.indexOf('function startSnapshotHistory()', setupStart);

  assert.notEqual(setupStart, -1);
  assert.notEqual(setupEnd, -1);

  const setupBody = js.slice(setupStart, setupEnd);
  assert.doesNotMatch(setupBody, /ensureSnapshotHistoryModal\\(\\)/);
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
console.log('Removed static Snapshot History modal from src/index.html. History modal is now runtime-only.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
console.log('');
console.log('Manual test: open rebuilt admin.html, connect, click History.');
