#!/usr/bin/env node
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = '1.1.62-repo-hygiene';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
}

function replaceOrFail(path, pattern, replacement, label) {
  const before = read(path);
  const after = before.replace(pattern, replacement);
  if (after === before) {
    throw new Error(`Could not update ${label} in ${path}`);
  }
  write(path, after);
}

function ensureLine(path, line) {
  const current = existsSync(path) ? read(path) : '';
  const lines = current.split(/\r?\n/).filter(Boolean);
  if (!lines.includes(line)) lines.push(line);
  write(path, `${lines.join('\n')}\n`);
}

function removePath(path) {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

// 1) Align all visible versions.
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

// Backup metadata version.
replaceOrFail(
  'src/js/17-backup.js',
  /version:\s*['"][^'"]+['"]/,
  `version: '${VERSION}'`,
  'backup metadata version'
);

// 2) Fix token storage copy in the login screen.
const indexPath = 'src/index.html';
let indexHtml = read(indexPath);
indexHtml = indexHtml.replace(
  /Stored in localStorage \(base64 — obfuscation, not encryption\)\./g,
  'Stored in sessionStorage for the current browser session. Older localStorage tokens are migrated once and removed.'
);
indexHtml = indexHtml.replace(
  /Stored in localStorage \(base64 -- obfuscation, not encryption\)\./g,
  'Stored in sessionStorage for the current browser session. Older localStorage tokens are migrated once and removed.'
);
write(indexPath, indexHtml);

// 3) Harden backup restore path handling.
//    Do not allow a ZIP without metadata.files to restore arbitrary entries.
//    Do not allow absolute paths, parent traversal, .git, or paths outside GitCMS content scope.
let backup = read('src/js/17-backup.js');

if (!backup.includes('function isSafeBackupPath(')) {
  backup = backup.replace(
    /\/\* ---------- backup \/ restore ---------- \*\//,
    `/* ---------- backup / restore ---------- */

function isSafeBackupPath(path) {
  const p = String(path || '').replace(/\\\\/g, '/').trim();
  if (!p) return false;
  if (p.startsWith('/')) return false;
  if (/^[A-Za-z]:\\//.test(p)) return false;
  const parts = p.split('/').filter(Boolean);
  if (parts.includes('..')) return false;
  if (parts.includes('.git')) return false;
  return true;
}

function isRestorableBackupPath(path, mediaDirPath) {
  const mediaRoot = String(mediaDirPath || '').replace(/\\/+$/, '');
  return (
    /\\.html?$/i.test(path) ||
    path === state.manifestPath ||
    path === CONFIG_PATH ||
    (mediaRoot && path.startsWith(mediaRoot + '/'))
  );
}`
  );
}

backup = backup.replace(
  /const\s+paths\s*=\s*\(meta\.files\s*\|\|\s*Object\.keys\(zip\.files\)\)\.filter\(\(k\)\s*=>\s*k\s*!==\s*['"]metadata\.json['"]\s*&&\s*!k\.endsWith\(['"]\/['"]\)\);/,
  `if (!Array.isArray(meta.files)) {
      throw new Error('Not a valid GitCMS backup — metadata.files must be an array.');
    }
    const mdir = mediaDir();
    const paths = meta.files
      .map((p) => String(p || '').trim())
      .filter((p) => p && p !== 'metadata.json' && !p.endsWith('/'));
    for (const path of paths) {
      if (!isSafeBackupPath(path) || !isRestorableBackupPath(path, mdir)) {
        throw new Error(\`Backup contains an unsupported path: \${path}\`);
      }
    }`
);

if (backup.includes('meta.files || Object.keys(zip.files)')) {
  throw new Error('Backup restore still falls back to Object.keys(zip.files)');
}

write('src/js/17-backup.js', backup);

// 4) Repo hygiene ignore rules. _site is intentionally not ignored/removed.
const ignorePath = '.gitignore';
[
  '/node_modules/',
  '.DS_Store',
  '/.DS_Store',
  '/test-results/',
  '/playwright-report/',
  '/coverage/',
  '*.log',
  '/admin.built.extracted.js',
  '/fragments.json',
  '/gitcms.config.json'
].forEach((line) => ensureLine(ignorePath, line));

// 5) Remove accidental local artifacts from the working tree.
//    _site is intentionally preserved.
[
  '.DS_Store',
  'test-results',
  'playwright-report',
  'coverage',
  'admin.built.extracted.js',
  'fragments.json',
  'gitcms.config.json'
].forEach(removePath);

// 6) Add regression tests for this cleanup.
const testPath = 'tests/repo-hygiene-version-backup.test.mjs';
write(
  testPath,
  `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('version is aligned across package, runtime, README, and backup metadata', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const core = readFileSync(new URL('../src/js/00-core.js', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const backup = readFileSync(new URL('../src/js/17-backup.js', import.meta.url), 'utf8');

  assert.match(core, new RegExp(\`GITCMS_VERSION\\\\s*=\\\\s*['"]\${pkg.version}['"]\`));
  assert.match(readme, new RegExp(pkg.version.replace(/[.*+?^${'${'}()|[\\\\]\\\\]/g, '\\\\$&')));
  assert.match(backup, new RegExp(\`version:\\\\s*['"]\${pkg.version}['"]\`));
});

test('repo hygiene ignores local artifacts while keeping _site trackable', () => {
  const gitignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');

  assert.match(gitignore, /\\.DS_Store/);
  assert.match(gitignore, /\\/test-results\\//);
  assert.match(gitignore, /\\/playwright-report\\//);
  assert.match(gitignore, /\\/fragments\\.json/);
  assert.match(gitignore, /\\/gitcms\\.config\\.json/);
  assert.doesNotMatch(gitignore, /_site/);
});

test('backup restore requires safe metadata file list and scoped paths', () => {
  const backup = readFileSync(new URL('../src/js/17-backup.js', import.meta.url), 'utf8');

  assert.match(backup, /function isSafeBackupPath/);
  assert.match(backup, /function isRestorableBackupPath/);
  assert.match(backup, /metadata\\.files must be an array/);
  assert.match(backup, /Backup contains an unsupported path/);
  assert.doesNotMatch(backup, /meta\\.files\\s*\\|\\|\\s*Object\\.keys\\(zip\\.files\\)/);
});

test('login copy describes sessionStorage token handling', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

  assert.match(html, /sessionStorage/);
  assert.doesNotMatch(html, /Stored in localStorage/);
});
`
);

console.log(`Applied ${VERSION} repo hygiene patch.`);
console.log('Preserved _site/. Removed local-only artifacts if present.');
printNextSteps();

function printNextSteps() {
  console.log(`
Next:
  npm install
  npm run format
  npm run build
  npm run format:check
  npm run check
  npm test
  git status
  git add -A
  git commit -m "Fix repo hygiene and version alignment"
  git push origin main
`);
}
