#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = '1.1.89-remove-readme-section-tests';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
}

function updateVersion() {
  const pkg = JSON.parse(read('package.json'));
  pkg.version = VERSION;
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

  if (existsSync('src/js/00-core.js')) {
    write(
      'src/js/00-core.js',
      read('src/js/00-core.js').replace(
        /const\s+GITCMS_VERSION\s*=\s*['"][^'"]+['"];/,
        `const GITCMS_VERSION = '${VERSION}';`
      )
    );
  }

  if (existsSync('src/js/17-backup.js')) {
    write(
      'src/js/17-backup.js',
      read('src/js/17-backup.js').replace(/version:\s*['"][^'"]+['"]/, `version: '${VERSION}'`)
    );
  }
}

function removeReadmeTestBlocks(source) {
  return source
    .replace(/\n?test\(['"][^'"]*README[^'"]*['"],\s*\(\)\s*=>\s*\{[\s\S]*?\n\}\);\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n';
}

function cleanupTests() {
  if (existsSync('tests/readme-runtime-notes.test.mjs')) {
    rmSync('tests/readme-runtime-notes.test.mjs', { force: true });
  }

  for (const file of readdirSync('tests')) {
    if (!file.endsWith('.mjs')) continue;

    const path = join('tests', file);
    const before = read(path);
    const after = removeReadmeTestBlocks(before);

    if (after !== before) {
      const hasTest = /\btest\(/.test(after);
      if (hasTest) {
        write(path, after);
      } else {
        rmSync(path, { force: true });
      }
    }
  }
}

function addGuardTest() {
  write(
    'tests/no-readme-section-tests.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

test('tests do not assert README runtime feature sections', () => {
  const files = readdirSync(new URL('../tests', import.meta.url)).filter((file) =>
    file.endsWith('.mjs')
  );

  for (const file of files) {
    if (file === 'clean-repo-docs.test.mjs') continue;
    if (file === 'no-readme-section-tests.test.mjs') continue;

    const source = readFileSync(new URL('../tests/' + file, import.meta.url), 'utf8');

    assert.doesNotMatch(source, /README documents/);
    assert.doesNotMatch(source, /readme = readFileSync/);
    assert.doesNotMatch(source, /readme-runtime-notes/);
  }
});
`
  );
}

updateVersion();
cleanupTests();
addGuardTest();

console.log(`Applied ${VERSION}.`);
console.log('Removed README section assertion tests.');
console.log('Kept clean-repo-docs.test.mjs intact.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
