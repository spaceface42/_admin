#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.93-snapshot-publish-title';

const PUBLISH_PATH = 'src/js/12-publish.js';
const HISTORY_PATH = 'src/js/18-snapshot-history.js';
const CSS_PATH = 'src/admin.css';
const README_PATH = 'README.md';
const PACKAGE_PATH = 'package.json';
const LOCK_PATH = 'package-lock.json';
const TEST_PATH = 'tests/snapshot-publish-title.test.mjs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
  console.log('updated ' + path);
}

function replaceOrThrow(path, pattern, replacement, label) {
  const before = read(path);
  const after = before.replace(pattern, replacement);
  if (after === before) {
    throw new Error('No replacement matched in ' + path + (label ? ' for ' + label : ''));
  }
  write(path, after);
}

function appendOnce(path, marker, block) {
  const before = read(path);
  if (before.includes(marker)) {
    console.log('already present ' + marker + ' in ' + path);
    return;
  }

  write(path, before.replace(/\s*$/, '') + '\n\n' + block.trim() + '\n');
}

function findFunctionRange(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return null;

  const open = source.indexOf('{', start);
  if (open < 0) return null;

  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1] || '';

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (ch === quote) {
        quote = '';
      }

      continue;
    }

    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return { start, end: i + 1 };
      }
    }
  }

  return null;
}

function replaceFunction(source, marker, replacement, label) {
  const range = findFunctionRange(source, marker);
  if (!range) throw new Error('Could not locate function for ' + label + ': ' + marker);
  return source.slice(0, range.start) + replacement.trim() + source.slice(range.end);
}

function updateVersionInFile(path) {
  if (!existsSync(path)) return;

  let text = read(path);
  text = text.replace(/GITCMS_VERSION\s*=\s*['"][^'"]+['"]/, "GITCMS_VERSION = '" + VERSION + "'");
  text = text.replace(/version:\s*['"][^'"]+['"]/, "version: '" + VERSION + "'");
  write(path, text);
}

if (!existsSync(PUBLISH_PATH) || !existsSync(HISTORY_PATH)) {
  throw new Error('Run this from the _admin repo root.');
}

// -----------------------------------------------------------------------------
// 1. Publish-time immutable snapshot title support.
// -----------------------------------------------------------------------------
let publish = read(PUBLISH_PATH);

if (publish.includes('GitCMSSnapshotRegistry') || publish.includes('SNAPSHOT_METADATA_BRANCH')) {
  throw new Error(
    'This branch still contains registry/metadata-branch code. Reset to the clean base before applying v1.1.93.'
  );
}

if (!publish.includes('function snapshotPublishTitleSlug(input)')) {
  const helpers = `const SNAPSHOT_PUBLISH_TITLE_MAX_LENGTH = 80;

function snapshotPublishTitleSlug(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SNAPSHOT_PUBLISH_TITLE_MAX_LENGTH)
    .replace(/-+$/g, '');
}

function snapshotPublishTimestamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/\\.\\d{3}Z$/, '')
    .replace('T', '-')
    .replace(/:/g, '');
}

function snapshotPublishTagName(title = '') {
  const slug = snapshotPublishTitleSlug(title);
  const timestamp = snapshotPublishTimestamp();
  return 'snapshot-' + timestamp + (slug ? '--' + slug : '');
}

function snapshotPublishPromptTitle() {
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') return '';

  const title = window.prompt(
    'Optional snapshot title for History.\\n\\nLeave empty for a date-only snapshot tag.',
    ''
  );

  return title === null ? '' : title;
}

`;

  publish = helpers + publish;
  console.log('inserted publish title helpers');
}

const newCreateSnapshotTag = `async function createSnapshotTag(commitSha) {
  const tagName = snapshotPublishTagName(snapshotPublishPromptTitle());

  await GitHubApi.request(GitHubApi.repoPath('/git/refs'), {
    method: 'POST',
    body: {
      ref: 'refs/tags/' + tagName,
      sha: commitSha
    }
  });

  return tagName;
}`;

publish = replaceFunction(
  publish,
  'async function createSnapshotTag',
  newCreateSnapshotTag,
  'createSnapshotTag'
);

write(PUBLISH_PATH, publish);

// -----------------------------------------------------------------------------
// 2. History display parses immutable titles from snapshot tag names.
// -----------------------------------------------------------------------------
let history = read(HISTORY_PATH);

if (history.includes('SNAPSHOT_METADATA_PATH') || history.includes('snapshotHistoryRename')) {
  throw new Error(
    'Snapshot history still contains mutable naming metadata. Reset to the clean base before applying v1.1.93.'
  );
}

if (!history.includes('function snapshotHistoryTitleFromName(name)')) {
  const titleFunctions = `function snapshotHistoryTitleFromName(name) {
  const m = String(name || '').match(/^snapshot-\\d{4}-\\d{2}-\\d{2}-\\d{6}--(.+)$/);
  if (!m) return '';
  return m[1].split('-').filter(Boolean).join(' ').trim();
}

function snapshotHistoryTitleMarkup(name) {
  const title = snapshotHistoryTitleFromName(name);
  return title ? '<div class="snapshot-history-title">' + esc(title) + '</div>' : '';
}

`;

  history = history.replace(
    /function snapshotHistoryAccentHue\(name\) \{/,
    titleFunctions + 'function snapshotHistoryAccentHue(name) {'
  );
  console.log('inserted snapshot history title parser');
}

const dateLinePattern =
  /(<div class="snapshot-history-date">\$\{esc\(snapshotHistoryDisplayDate\(tag\.name\)\)\}<\/div>)/;

if (!history.includes('snapshotHistoryTitleMarkup(tag.name)')) {
  const next = history.replace(
    dateLinePattern,
    (match) => match + '\n          ${snapshotHistoryTitleMarkup(tag.name)}'
  );

  if (next === history) {
    throw new Error(
      'Could not locate snapshotHistoryDisplayDate(tag.name) card markup in ' + HISTORY_PATH
    );
  }

  history = next;
  console.log('inserted snapshot title card markup');
}

history = history.replace(
  /Snapshot tags are created after publishing\. Rollback moves both content and main to the\s+selected snapshot commit\. Rollback does not create a new snapshot tag\./,
  'Snapshot tags are created after publishing. Optional titles are stored immutably in the tag name. Rollback moves both content and main to the selected snapshot commit. Rollback does not create a new snapshot tag.'
);

write(HISTORY_PATH, history);

// -----------------------------------------------------------------------------
// 3. CSS.
// -----------------------------------------------------------------------------
if (existsSync(CSS_PATH)) {
  appendOnce(
    CSS_PATH,
    'snapshot-history-title',
    `
.snapshot-history-title {
  color: rgb(255 255 255 / 0.94);
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.25;
  margin-top: 6px;
  overflow-wrap: anywhere;
}
`
  );
}

// -----------------------------------------------------------------------------
// 4. Tests.
// -----------------------------------------------------------------------------
const test = `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('publish creates immutable snapshot title slugs inside tag names', () => {
  const js = readFileSync(new URL('../src/js/12-publish.js', import.meta.url), 'utf8');

  assert.match(js, /function snapshotPublishTitleSlug\\(input\\)/);
  assert.match(js, /function snapshotPublishPromptTitle\\(\\)/);
  assert.match(js, /function snapshotPublishTagName\\(title = ''\\)/);
  assert.match(js, /window\\.prompt/);
  assert.match(js, /'snapshot-' \\+ timestamp \\+ \\(slug \\? '--' \\+ slug : ''\\)/);
  assert.match(js, /async function createSnapshotTag\\(commitSha\\)/);
  assert.match(js, /snapshotPublishTagName\\(snapshotPublishPromptTitle\\(\\)\\)/);
  assert.match(js, /ref: 'refs\\/tags\\/' \\+ tagName/);
});

test('snapshot publish titles do not use mutable metadata registry', () => {
  const publish = readFileSync(new URL('../src/js/12-publish.js', import.meta.url), 'utf8');
  const history = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.equal(publish.includes('GitCMSSnapshotRegistry'), false);
  assert.equal(history.includes('SNAPSHOT_METADATA_BRANCH'), false);
  assert.equal(history.includes('SNAPSHOT_METADATA_PATH'), false);
  assert.equal(history.includes('snapshotHistoryRename'), false);
  assert.equal(history.includes('snapshots.json'), false);
});

test('snapshot history displays publish-time title parsed from tag slug', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /function snapshotHistoryTitleFromName\\(name\\)/);
  assert.match(js, /function snapshotHistoryTitleMarkup\\(name\\)/);
  assert.match(js, /snapshotHistoryTitleMarkup\\(tag\\.name\\)/);
  assert.match(js, /snapshotHistoryDisplayDate\\(tag\\.name\\)/);
});

test('README documents publish-time snapshot titles', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Snapshot publish titles/);
  assert.match(readme, /snapshot-YYYY-MM-DD-HHMMSS--safe-title/);
  assert.match(readme, /no rename/);
  assert.match(readme, /no metadata branch/);
});
`;

write(TEST_PATH, test);

// -----------------------------------------------------------------------------
// 5. README and version alignment.
// -----------------------------------------------------------------------------
if (existsSync(README_PATH)) {
  let readme = read(README_PATH);
  readme = readme.replace(/Current version:\s*`[^`]+`\.?/, 'Current version: `' + VERSION + '`.');

  if (!readme.includes('## Snapshot publish titles')) {
    readme =
      readme.replace(/\s*$/, '') +
      `

## Snapshot publish titles

Version target: \`${VERSION}\`.

Snapshot titles are immutable and are chosen only during publish.

When publish creates a snapshot tag, the admin asks for an optional title. The title is converted into a safe slug and appended to the Git tag name:

\`\`\`txt
snapshot-YYYY-MM-DD-HHMMSS--safe-title
\`\`\`

Example:

\`\`\`txt
Title typed during publish:
Homepage approved before client review

Created tag:
snapshot-2026-06-09-144500--homepage-approved-before-client-review
\`\`\`

If the title is empty or the prompt is cancelled, the admin creates the normal date-only tag:

\`\`\`txt
snapshot-2026-06-09-144500
\`\`\`

This feature deliberately has no rename action, no metadata branch, and no snapshots JSON registry. Rollback and delete continue to target the immutable Git tag name.
`;
  }

  write(README_PATH, readme);
}

if (existsSync(PACKAGE_PATH)) {
  const pkg = JSON.parse(read(PACKAGE_PATH));
  pkg.version = VERSION;
  write(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + '\n');
}

if (existsSync(LOCK_PATH)) {
  const lock = JSON.parse(read(LOCK_PATH));
  lock.version = VERSION;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = VERSION;
  }
  write(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n');
}

updateVersionInFile('src/js/00-core.js');
updateVersionInFile('src/admin.js');
updateVersionInFile('src/js/17-backup.js');

console.log('');
console.log('Snapshot publish title patch applied.');
console.log('');
console.log('Next:');
console.log('  npx prettier --write src/**/*.js src/**/*.mjs src/**/*.css src/**/*.html tests/**/*.mjs *.md');
console.log('  npm run build');
console.log('  npm test');
console.log('  npm run quality');
