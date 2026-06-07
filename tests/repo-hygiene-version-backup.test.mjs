import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('version is aligned across package, runtime, README, and backup metadata', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const core = readFileSync(new URL('../src/js/00-core.js', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const backup = readFileSync(new URL('../src/js/17-backup.js', import.meta.url), 'utf8');

  assert.match(core, new RegExp(`GITCMS_VERSION\\s*=\\s*['"]${pkg.version}['"]`));
  assert.match(readme, new RegExp(pkg.version.replace(/[.*+?^${()|[\\]\\]/g, '\\$&')));
  assert.match(backup, new RegExp(`version:\\s*['"]${pkg.version}['"]`));
});

test('repo hygiene ignores local artifacts while keeping _site trackable', () => {
  const gitignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');

  assert.match(gitignore, /\.DS_Store/);
  assert.match(gitignore, /\/test-results\//);
  assert.match(gitignore, /\/playwright-report\//);
  assert.match(gitignore, /\/fragments\.json/);
  assert.match(gitignore, /\/gitcms\.config\.json/);
  assert.doesNotMatch(gitignore, /_site/);
});

test('backup restore requires safe metadata file list and scoped paths', () => {
  const backup = readFileSync(new URL('../src/js/17-backup.js', import.meta.url), 'utf8');

  assert.match(backup, /function isSafeBackupPath/);
  assert.match(backup, /function isRestorableBackupPath/);
  assert.match(backup, /metadata\.files must be an array/);
  assert.match(backup, /Backup contains an unsupported path/);
  assert.doesNotMatch(backup, /meta\.files\s*\|\|\s*Object\.keys\(zip\.files\)/);
});

test('login copy describes sessionStorage token handling', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

  assert.match(html, /sessionStorage/);
  assert.doesNotMatch(html, /Stored in localStorage/);
});
