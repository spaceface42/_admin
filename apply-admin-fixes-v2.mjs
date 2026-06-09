#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NEW_VERSION = '1.1.88';
const repoRoot = process.cwd();
const warnings = [];

function full(path) {
  return join(repoRoot, path);
}

function requireFile(path) {
  if (!existsSync(full(path))) {
    throw new Error(`Missing ${path}. Run this script from the _admin repo root.`);
  }
}

function read(path) {
  return readFileSync(full(path), 'utf8');
}

function write(path, content) {
  writeFileSync(full(path), content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

function replaceInFile(path, replacements, { required = false } = {}) {
  let content = read(path);
  let matched = false;

  for (const [pattern, replacement] of replacements) {
    const next = content.replace(pattern, replacement);
    if (next !== content) matched = true;
    content = next;
  }

  if (required && !matched) {
    throw new Error(`No replacement matched in ${path}`);
  }

  if (!matched) {
    warnings.push(`No text replacement needed/matched in ${path}`);
  }

  write(path, content);
}

function removeIfExists(path) {
  const target = full(path);
  if (!existsSync(target)) return;
  const stat = lstatSync(target);
  rmSync(target, { recursive: stat.isDirectory(), force: true });
}

function updateIndexLoginCopy() {
  const path = 'src/index.html';
  let content = read(path);

  const alreadyUpdated = /does not auto-connect|does not automatically connect|press Connect/i.test(content);
  if (alreadyUpdated) {
    warnings.push('src/index.html login copy already mentions explicit Connect, so it was left unchanged');
    write(path, content);
    return;
  }

  const sentence = ' GitCMS pre-fills saved values, but it does not auto-connect; press Connect to open the repo.';

  const patterns = [
    [
      /Stored in sessionStorage for the current browser session\. Older localStorage tokens are migrated once and removed\./,
      `Stored in sessionStorage for the current browser session. Older localStorage tokens are migrated once and removed.${sentence}`
    ],
    [
      /Stored in sessionStorage for the current browser session\./,
      `Stored in sessionStorage for the current browser session.${sentence}`
    ],
    [
      /(sessionStorage[^<.]*\.)/i,
      `$1${sentence}`
    ]
  ];

  for (const [pattern, replacement] of patterns) {
    const next = content.replace(pattern, replacement);
    if (next !== content) {
      write(path, next);
      return;
    }
  }

  warnings.push('Could not find the sessionStorage helper text in src/index.html; skipped copy update only');
  write(path, content);
}

requireFile('package.json');
requireFile('src/js/00-core.js');
requireFile('src/js/16-prefill.js');
requireFile('src/js/17-backup.js');
requireFile('src/index.html');
requireFile('build-admin.mjs');
requireFile('.github/workflows/quality.yml');
requireFile('tests/clean-repo-docs.test.mjs');
requireFile('tests/build-admin-docs-output.test.mjs');
requireFile('tests/ci-quality-config.test.mjs');

const pkg = JSON.parse(read('package.json'));
if (pkg.name !== 'gitcms-admin') {
  throw new Error(`This does not look like the _admin repo. package.name=${pkg.name}`);
}

pkg.version = NEW_VERSION;
pkg.scripts = {
  ...pkg.scripts,
  quality: 'npm run build && npm run check && npm test && npm run format:check && npm run lint'
};
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

replaceInFile('src/js/00-core.js', [
  [/const GITCMS_VERSION = ['"][^'"]+['"];/, `const GITCMS_VERSION = '${NEW_VERSION}';`]
]);

replaceInFile('src/js/17-backup.js', [
  [/version:\s*['"][^'"]+['"]/, `version: '${NEW_VERSION}'`]
]);

write(
  'src/js/16-prefill.js',
  `/* ---------- prefill ---------- */
(function init() {
  const repo = localStorage.getItem(LS_REPO);
  const token = TokenStorage.read();

  if (repo) el('repoUrl').value = repo;
  if (token) {
    try {
      el('token').value = dec(token);
    } catch (e) {}
  }

  // Keep repository/token prefill convenient, but require an explicit Connect click.
  // This avoids silently opening a repo with a restored session token on shared machines.
})();

// Render default editor snippets after all modules, including EditorUtils, are initialized.
// Config-loaded refreshes still happen after connect/settings save.
if (typeof renderEditorSnippetControls === 'function') {
  renderEditorSnippetControls();
}
`
);

updateIndexLoginCopy();

replaceInFile('build-admin.mjs', [
  [/\.\/docs\/admin\.html/g, './docs/index.html'],
  [/docs\/admin\.html/g, 'docs/index.html']
]);

replaceInFile('.github/workflows/quality.yml', [
  [/Verify docs admin output/g, 'Verify docs index output'],
  [/docs\/admin\.html/g, 'docs/index.html']
]);

replaceInFile('tests/build-admin-docs-output.test.mjs', [
  [/docs\/admin\.html/g, 'docs/index.html'],
  [/docs\\\/admin\\\.html/g, 'docs\\/index\\.html']
]);

replaceInFile('tests/ci-quality-config.test.mjs', [
  [/docs\/admin\.html/g, 'docs/index.html'],
  [/docs\\\/admin\\\.html/g, 'docs\\/index\\.html']
]);

replaceInFile('tests/clean-repo-docs.test.mjs', [
  [/docs\/admin\.html/g, 'docs/index.html'],
  [/docs\\\/admin\\\.html/g, 'docs\\/index\\.html']
]);

write(
  'tests/session-connect-policy.test.mjs',
  `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('prefill does not auto-connect with restored session token', () => {
  const prefill = readFileSync(new URL('../src/js/16-prefill.js', import.meta.url), 'utf8');
  assert.match(prefill, /TokenStorage\.read/);
  assert.match(prefill, /explicit Connect click/);
  assert.doesNotMatch(prefill, /\bconnect\(\)/);
});
`
);

write(
  'README.md',
  `# GitCMS Admin

Current version: \`${NEW_VERSION}\`.

Zero-backend CMS for HTML-native static sites. The admin is a static browser app that edits fragments in a separate GitHub content repository through the GitHub API.

## Repo model

\`\`\`txt
_admin = CMS/admin repository
_site   = administered content/site repository

content = editing
main    = live published
\`\`\`

Edits are saved to the configured work branch, normally \`content\`. Publishing moves the approved content to \`main\`. The admin repository is separate from the administered site repository.

## Security model

- Use a fine-grained GitHub PAT scoped only to the administered content/site repo.
- The repository URL is stored in \`localStorage\` for convenience.
- The GitHub token is stored only in \`sessionStorage\` and is cleared when the browser session ends.
- Saved values may be prefilled, but GitCMS does not auto-connect. Press **Connect** explicitly.

## Build

\`\`\`bash
npm ci
npm run build
\`\`\`

## Test

\`\`\`bash
npm run check
npm test
npm run format:check
npm run lint
npm run quality
npm run test:smoke
\`\`\`

\`npm run test:smoke\` requires Chromium for Playwright:

\`\`\`bash
npx playwright install chromium
\`\`\`

## Source layout

\`\`\`txt
src/index.html        admin shell
src/admin.css         admin styles
src/js/               browser app modules, numbered by load order
src/lib/*.mjs         shared utility modules used by browser build and tests
tests/                Node unit/regression tests
smoke/                Playwright browser smoke tests
scripts/              build support scripts
docs/                 GitHub Pages build output
\`\`\`

## Build output

\`\`\`txt
admin.html            standalone local admin
docs/index.html       GitHub Pages hosted admin
\`\`\`

## Content repo config

Add \`gitcms.config.json\` to the administered content/site repo:

\`\`\`json
{
  "workBranch": "content",
  "manifestPath": "fragments.json",
  "media": {
    "dir": "docs/assets/media",
    "publicPrefix": "assets/media/"
  },
  "preview": {
    "css": ["assets/style.css"]
  }
}
\`\`\`

## Fragment model

GitCMS treats named HTML fragments as the editable unit. Your HTML remains the source of truth; markdown generation is not required.
`
);

write(
  '.gitignore',
  `/node_modules/
.DS_Store
/.DS_Store
/test-results/
/playwright-report/
/coverage/
*.log
/admin.built.extracted.js
/fragments.json
/gitcms.config.json
`
);

for (const path of [
  '.DS_Store',
  'test-results',
  'playwright-report',
  'ARCHITECTURE.md',
  'CONTENT_WRITE_SOURCE_FIX_NOTES.md',
  'MANUAL_REGRESSION_TEST.md',
  'PATHS_MODULE_REFACTOR_NOTES.md',
  'PATH_MEDIA_WRAPPERS_REFACTOR_NOTES.md',
  'PUBLISH_WORKFLOW.md',
  'RELEASE_CHECKLIST.md',
  'STABLE.md'
]) {
  removeIfExists(path);
}

console.log(`Admin cleanup applied. Version is now ${NEW_VERSION}.`);
if (warnings.length) {
  console.log('\nNotes:');
  for (const warning of warnings) console.log(`- ${warning}`);
}
console.log('\nNext: npm run build && npm run quality && npm run test:smoke');
