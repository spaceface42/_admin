import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const removedBrowserDuplicates = [
  '00-api-utils.js',
  '00-connect-utils.js',
  '00-content-source-utils.js',
  '01-github-errors.js',
  '02-config-utils.js',
  '04-preview-paths.js',
  '07-editor-utils.js',
  '08-media-utils.js',
  '10-publish-utils.js',
  '12-diagnostics-utils.js'
];

test('manual duplicated browser utility files were removed', () => {
  for (const file of removedBrowserDuplicates) {
    assert.equal(existsSync(new URL(`../src/js/${file}`, import.meta.url)), false, file);
  }
});

test('build script generates shared browser utilities from src/lib', () => {
  const build = readFileSync(new URL('../build-admin.mjs', import.meta.url), 'utf8');

  assert.match(build, /SHARED_UTILITY_MODULES/);
  assert.match(build, /src\/lib\/\$\{spec\.lib\}/);
  assert.match(build, /Generated from src\/lib/);
  assert.match(build, /maybeEsbuildTransform/);
  assert.match(build, /await import\("esbuild"\)/);
});

test('package uses esbuild as a build dependency', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  assert.ok(pkg.devDependencies.esbuild);
});

test('generated admin contains utilities sourced from src/lib wrappers', () => {
  const generated = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');

  assert.match(generated, /Generated from src\/lib\/editor-utils\.mjs/);
  assert.match(generated, /const EditorUtils =/);
  assert.match(generated, /const GitHubApiUtils =/);
});
