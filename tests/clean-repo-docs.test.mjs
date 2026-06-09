import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

test('repo keeps markdown documentation centralized', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(root, '..');
  const markdown = walk(repoRoot)
    .filter((path) => path.endsWith('.md'))
    .map((path) => relative(repoRoot, path))
    .sort();

  assert.deepEqual(markdown, ['README.md']);
});

test('README documents the current repo model and build output', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /content = editing/);
  assert.match(readme, /main\s+= live published/);
  assert.match(readme, /docs\/index\.html/);
  assert.match(readme, /src\/lib\/\*\.mjs/);
});
