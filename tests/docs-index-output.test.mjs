import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

test('build script syncs root admin.html to docs/index.html', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  assert.match(pkg.scripts.build, /node scripts\/sync-docs-index\.mjs/);
});

test('docs sync script keeps docs output to index.html only', () => {
  const script = readFileSync(new URL('../scripts/sync-docs-index.mjs', import.meta.url), 'utf8');

  assert.match(script, /copyFileSync\(rootAdmin, docsIndex\)/);
  assert.match(script, /entry === 'index\.html'/);
  assert.match(script, /rmSync\(target, \{ recursive: true, force: true \}\)/);
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
