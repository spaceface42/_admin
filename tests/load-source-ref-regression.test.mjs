import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function functionBody(source, name) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `${name} not found`);
  const next = source.indexOf('\n\nasync function ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test('manifest load uses sourceRef, not tree-scan snapshot variable', () => {
  const source = readFileSync(new URL('../src/js/03-connect-load.js', import.meta.url), 'utf8');
  const body = functionBody(source, 'tryLoadFromManifest');

  assert.match(body, /fetchFile\(p,\s*sourceRef\)/);
  assert.doesNotMatch(body, /snapshot/);
});

test('tree scan fallback uses its own snapshot commit', () => {
  const source = readFileSync(new URL('../src/js/03-connect-load.js', import.meta.url), 'utf8');
  const body = functionBody(source, 'tryTreeScan');

  assert.match(body, /const snapshot = await GitHubApi\.getBranchTreeSnapshot/);
  assert.match(body, /fetchFile\(p,\s*snapshot\.commitSha \|\| state\.workBranch\)/);
});
