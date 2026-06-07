import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

test('tests avoid URL.pathname filesystem paths for Windows compatibility', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const files = walk(root)
    .filter(path => path.endsWith('.mjs'))
    .filter(path => path.includes(`${join('tests')}${join('').includes('\\') ? '\\' : '/'}`) || path.includes('/tests/') || path.includes('\\tests\\'));

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /new URL\([^)]*import\.meta\.url\)\.pathname/, file);
  }
});
