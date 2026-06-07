#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = '1.1.85-docs-index-clean';

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

function updateVersionAndBuildScript() {
  const pkg = JSON.parse(read('package.json'));
  pkg.version = VERSION;

  const buildScript = String(pkg.scripts?.build || '');
  if (!buildScript.includes('node scripts/sync-docs-index.mjs')) {
    pkg.scripts.build = buildScript
      ? `${buildScript} && node scripts/sync-docs-index.mjs`
      : 'node build-admin.mjs && node scripts/sync-docs-index.mjs';
  }

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

function writeSyncScript() {
  if (!existsSync('scripts')) mkdirSync('scripts', { recursive: true });

  write(
    'scripts/sync-docs-index.mjs',
    `import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const rootAdmin = 'admin.html';
const docsDir = 'docs';
const docsIndex = join(docsDir, 'index.html');

if (!existsSync(rootAdmin)) {
  throw new Error('admin.html not found. Run the admin build first.');
}

if (!existsSync(docsDir)) {
  mkdirSync(docsDir, { recursive: true });
}

for (const entry of readdirSync(docsDir)) {
  const target = join(docsDir, entry);
  if (entry === 'index.html') continue;
  rmSync(target, { recursive: true, force: true });
}

copyFileSync(rootAdmin, docsIndex);

console.log('Synced admin.html -> docs/index.html');
console.log('Cleaned docs/ so it contains only index.html');
`
  );
}

function cleanDocsNow() {
  if (!existsSync('admin.html')) {
    console.warn('admin.html not found now; docs cleanup will run after npm run build.');
    return;
  }

  if (!existsSync('docs')) mkdirSync('docs', { recursive: true });

  for (const entry of readdirSync('docs')) {
    if (entry === 'index.html') continue;
    rmSync(join('docs', entry), { recursive: true, force: true });
  }

  write('docs/index.html', read('admin.html'));
}

function patchReadme() {
  let readme = read('README.md');

  if (!readme.includes('## Docs deployment output')) {
    readme += `

---

## Docs deployment output

The admin build keeps the hosted output minimal:

\`\`\`txt
admin.html        root local admin file
docs/index.html   hosted GitHub Pages admin entry
\`\`\`

The build script runs:

\`\`\`txt
node scripts/sync-docs-index.mjs
\`\`\`

This copies root \`admin.html\` to \`docs/index.html\` and removes every other file from
\`docs/\`.

The root \`_site/\` folder is intentionally not touched. It remains available as a
starter/site template.
`;
  }

  write('README.md', readme);
}

function writeTests() {
  write(
    'tests/docs-index-output.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

test('build script syncs root admin.html to docs/index.html', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  assert.match(pkg.scripts.build, /node scripts\\/sync-docs-index\\.mjs/);
});

test('docs sync script keeps docs output to index.html only', () => {
  const script = readFileSync(new URL('../scripts/sync-docs-index.mjs', import.meta.url), 'utf8');

  assert.match(script, /copyFileSync\\(rootAdmin, docsIndex\\)/);
  assert.match(script, /entry === 'index\\.html'/);
  assert.match(script, /rmSync\\(target, \\{ recursive: true, force: true \\}\\)/);
});

test('docs folder contains only index.html after build sync', () => {
  const entries = existsSync(new URL('../docs', import.meta.url))
    ? readdirSync(new URL('../docs', import.meta.url)).sort()
    : [];

  assert.deepEqual(entries, ['index.html']);
});

test('_site starter is not targeted by docs sync script', () => {
  const script = readFileSync(new URL('../scripts/sync-docs-index.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(script, /_site/);
});
`
  );
}

updateVersionAndBuildScript();
writeSyncScript();
cleanDocsNow();
patchReadme();
writeTests();

console.log(`Applied ${VERSION}.`);
console.log('Build now copies root admin.html to docs/index.html and cleans docs/ to index.html only.');
console.log('_site/ is not touched.');
console.log('');
console.log('Next:');
console.log('  Remove extra root markdown docs if present, e.g. GitCMS_How_It_Works.md');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
console.log('');
console.log('Commit after verification:');
console.log('  git add -A');
console.log('  git commit -m "Clean docs output to index admin"');
console.log('  git push origin main');
