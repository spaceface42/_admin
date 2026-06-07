#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.87-snapshot-history-numbering';

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

function patchSnapshotHistory() {
  const path = 'src/js/18-snapshot-history.js';
  if (!existsSync(path)) throw new Error('src/js/18-snapshot-history.js not found');

  let js = read(path);

  if (!js.includes('function snapshotHistoryNumberTags(')) {
    js = js.replace(
      /function snapshotHistoryApplyColor\(card, tag\) \{[\s\S]*?\n\}/,
      `function snapshotHistoryApplyColor(card, tag) {
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
}`
    );
  }

  const oldLine = `  list.innerHTML = '';
  for (const tag of tags) {`;

  const newLine = `  list.innerHTML = '';
  const snapshotNumberByName = snapshotHistoryNumberTags(tags);

  for (const tag of tags) {`;

  if (js.includes(oldLine) && !js.includes('const snapshotNumberByName = snapshotHistoryNumberTags(tags);')) {
    js = js.replace(oldLine, newLine);
  }

  const oldCardStart = `    snapshotHistoryApplyColor(card, tag);
    card.innerHTML = \`
      <div class="media-name" style="font-size:15px;color:var(--txt)">\${esc(snapshotHistoryDisplayDate(tag.name))}</div>`;

  const newCardStart = `    snapshotHistoryApplyColor(card, tag);
    const snapshotNumber = snapshotNumberByName.get(tag.name) || 0;
    card.innerHTML = \`
      <div class="snapshot-history-head" style="display:flex;align-items:center;gap:10px;padding:8px 9px 2px">
        <div class="snapshot-history-number" style="min-width:34px;height:34px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);font-family:var(--mono);font-size:15px;font-weight:800;color:var(--txt)">\${esc(String(snapshotNumber))}</div>
        <div class="media-name" style="font-size:15px;color:var(--txt);padding:0;border-top:0">\${esc(snapshotHistoryDisplayDate(tag.name))}</div>
      </div>`;

  if (js.includes(oldCardStart)) {
    js = js.replace(oldCardStart, newCardStart);
  } else if (!js.includes('snapshot-history-number')) {
    throw new Error('Could not find snapshot card date line to patch.');
  }

  write(path, js);
}

function patchReadme() {
  let readme = read('README.md');

  if (!readme.includes('Snapshot numbering')) {
    readme += `

---

## Snapshot numbering

History snapshot cards are numbered by age:

\`\`\`txt
oldest snapshot = 1
newest snapshot = total snapshot count
\`\`\`

Example: if there are 15 snapshots, the newest card shows number 15.

The visual number is rendered on each History card beside the larger readable date.
`;
  }

  write('README.md', readme);
}

function writeTests() {
  write(
    'tests/snapshot-history-numbering.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('snapshot history numbers snapshots oldest to newest', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /function snapshotHistoryNumberTags\\(tags\\)/);
  assert.match(js, /sortedOldestFirst = \\[\\.\\.\\.tags\\]\\.sort\\(\\(a, b\\) => a\\.name\\.localeCompare\\(b\\.name\\)\\)/);
  assert.match(js, /byName\\.set\\(tag\\.name, index \\+ 1\\)/);
  assert.match(js, /const snapshotNumberByName = snapshotHistoryNumberTags\\(tags\\)/);
  assert.match(js, /snapshotNumberByName\\.get\\(tag\\.name\\)/);
});

test('snapshot history cards render a visual number beside the date', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /snapshot-history-number/);
  assert.match(js, /snapshot-history-head/);
  assert.match(js, /snapshotHistoryDisplayDate\\(tag\\.name\\)/);
});

test('README documents snapshot numbering', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Snapshot numbering/);
  assert.match(readme, /oldest snapshot = 1/);
  assert.match(readme, /newest snapshot = total snapshot count/);
});
`
  );
}

updateVersion();
patchSnapshotHistory();
patchReadme();
writeTests();

console.log(`Applied ${VERSION}.`);
console.log('Snapshot cards now show age-based numbers: oldest = 1, newest = total count.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
