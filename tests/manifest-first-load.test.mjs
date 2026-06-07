import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildContentTreeSnapshot } from '../src/lib/content-source-utils.mjs';

test('loadAll resolves content source before recursive tree scanning', () => {
  const js = readFileSync(new URL('../src/js/03-connect-load.js', import.meta.url), 'utf8');

  const loadAllIndex = js.indexOf('async function loadAll()');
  const loadAllBody = js.slice(
    loadAllIndex,
    js.indexOf('/* Load files referenced by a manifest', loadAllIndex)
  );

  assert.match(loadAllBody, /resolveContentLoadSource\(\)/);
  assert.match(loadAllBody, /loadManifest\(source\.commitSha\)/);
  assert.match(loadAllBody, /tryLoadFromManifest\(workMan, source\.commitSha\)/);
  assert.doesNotMatch(
    loadAllBody,
    /getBranchTreeSnapshot\(state\.workBranch, \{ force: true \}\);\n\s*el\('banner'\)/
  );
});

test('manifest and listed files are read through Contents API at resolved ref', () => {
  const js = readFileSync(new URL('../src/js/03-connect-load.js', import.meta.url), 'utf8');

  assert.match(js, /GitHubApi\.getContent\(state\.manifestPath, ref\)/);
  assert.match(js, /GitHubApi\.getContent\(path, ref\)/);
});

test('content tree snapshots can represent manifest-first reads without recursive tree', () => {
  const snapshot = buildContentTreeSnapshot({
    branch: 'content',
    commitSha: 'abc',
    treeSha: 'tree',
    source: 'branch ref · manifest-first',
    treeResponse: null,
    treeLoaded: false
  });

  assert.equal(snapshot.treeLoaded, false);
  assert.deepEqual(snapshot.tree, []);
});
