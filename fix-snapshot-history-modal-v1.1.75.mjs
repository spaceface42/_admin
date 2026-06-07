#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.75-snapshot-modal-container-fix';

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

function patchSnapshotHistorySource() {
  const path = 'src/js/18-snapshot-history.js';
  if (!existsSync(path)) {
    throw new Error('src/js/18-snapshot-history.js not found. Apply snapshot history first.');
  }

  let js = read(path);

  js = js.replace(/modal\.className = 'modal';/g, "modal.className = 'modal-bg';");
  js = js.replace(/<div class="modal-card wide">/g, '<div class="modal media-modal">');

  // Do not create the modal during startup. In the built single file, the script can execute
  // before the static modal markup is parsed. Creating it at startup can cause duplicate IDs.
  js = js.replace(
    /function setupSnapshotHistory\(\) \{\s*const btn = ensureSnapshotHistoryButton\(\);\s*ensureSnapshotHistoryModal\(\);/,
    `function setupSnapshotHistory() {
  const btn = ensureSnapshotHistoryButton();`
  );

  write(path, js);
}

function patchIndexModalMarkup() {
  const path = 'src/index.html';
  let html = read(path);

  html = html.replace(
    /<div class="modal" id="snapshotHistoryModal">\s*<div class="modal-card wide">/g,
    `<div class="modal-bg" id="snapshotHistoryModal">
      <div class="modal media-modal">`
  );

  // In case an earlier patch left a runtime-style card class in source.
  html = html.replace(
    /<div class="modal" id="snapshotHistoryModal">\s*<div class="modal media-modal">/g,
    `<div class="modal-bg" id="snapshotHistoryModal">
      <div class="modal media-modal">`
  );

  write(path, html);
}

function patchReadme() {
  let readme = read('README.md');

  if (!readme.includes('Snapshot history modal uses modal-bg')) {
    readme += `

---

## Snapshot history modal implementation note

Snapshot history uses the standard modal structure:

\`\`\`html
<div class="modal-bg" id="snapshotHistoryModal">
  <div class="modal media-modal">...</div>
</div>
\`\`\`

The History module must not create the modal during startup, because the single-file build
can execute JavaScript before late static modal markup has been parsed. The modal is
created or reused only when History is opened.
`;
  }

  write('README.md', readme);
}

function writeTests() {
  write(
    'tests/snapshot-history-modal-container.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snapshot history source HTML uses standard modal-bg wrapper', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

  assert.match(html, /class=["']modal-bg["'] id=["']snapshotHistoryModal["']/);
  assert.match(html, /class=["']modal media-modal["']/);
  assert.doesNotMatch(html, /class=["']modal["'] id=["']snapshotHistoryModal["']/);
  assert.doesNotMatch(html, /modal-card wide/);
});

test('snapshot history runtime creates standard modal-bg wrapper', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /modal\\.className = 'modal-bg'/);
  assert.match(js, /<div class="modal media-modal">/);
  assert.match(js, /modal\\.classList\\.add\\('show'\\)/);
});

test('snapshot history does not create modal during startup', () => {
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
patchSnapshotHistorySource();
patchIndexModalMarkup();
patchReadme();
writeTests();

console.log(`Applied ${VERSION}.`);
console.log('Fixed History modal container: modal-bg wrapper + no startup duplicate modal creation.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
console.log('');
console.log('Manual test: open rebuilt admin.html, connect, click History.');
