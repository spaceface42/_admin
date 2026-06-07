#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.86-docs-index-tests-fix';

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

function patchBuildOutputTest() {
  const path = 'tests/build-output-inline.test.mjs';
  if (!existsSync(path)) {
    throw new Error(`${path} not found`);
  }

  let test = read(path);

  test = test.replace(
    /built docs\/admin\.html is standalone and matches root admin\.html/g,
    'built docs/index.html is standalone and matches root admin.html'
  );

  test = test.replace(
    /new URL\(['"]\.\.\/docs\/admin\.html['"], import\.meta\.url\)/g,
    "new URL('../docs/index.html', import.meta.url)"
  );

  test = test.replace(/docs\/admin\.html/g, 'docs/index.html');

  write(path, test);
}

function addGuardTest() {
  write(
    'tests/docs-admin-output-removed.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';

test('docs output uses index.html, not admin.html', () => {
  const docsUrl = new URL('../docs', import.meta.url);
  const entries = existsSync(docsUrl) ? readdirSync(docsUrl).sort() : [];

  assert.deepEqual(entries, ['index.html']);
  assert.equal(existsSync(new URL('../docs/index.html', import.meta.url)), true);
  assert.equal(existsSync(new URL('../docs/admin.html', import.meta.url)), false);
});
`
  );
}

function patchReadme() {
  let readme = read('README.md');

  readme = readme.replace(/docs\/admin\.html/g, 'docs/index.html');

  if (!readme.includes('docs/admin.html is intentionally not generated')) {
    readme += `

---

## Docs output test rule

\`docs/admin.html\` is intentionally not generated.

The hosted admin entry is:

\`\`\`txt
docs/index.html
\`\`\`

Tests should compare root \`admin.html\` against \`docs/index.html\`, not
\`docs/admin.html\`.
`;
  }

  write('README.md', readme);
}

updateVersion();
patchBuildOutputTest();
addGuardTest();
patchReadme();

console.log(`Applied ${VERSION}.`);
console.log('Updated tests from docs/admin.html to docs/index.html.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
