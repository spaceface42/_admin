import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('dirty-state and validation libs are wired into browser build', () => {
  const build = readFileSync(new URL('../build-admin.mjs', import.meta.url), 'utf8');

  assert.match(build, /dirty-state\.mjs/);
  assert.match(build, /global:\s*"DirtyState"/);
  assert.match(build, /fragment-parser\.mjs/);
  assert.match(build, /validation\.mjs/);
  assert.match(build, /global:\s*"Validation"/);
});

test('Store delegates dirty logic to DirtyState', () => {
  const store = readFileSync(new URL('../src/js/00-store.js', import.meta.url), 'utf8');

  assert.match(store, /DirtyState\.manifestLabelForFragment/);
  assert.match(store, /DirtyState\.isFragmentDirty/);
  assert.match(store, /DirtyState\.applyEditorValues/);
  assert.match(store, /DirtyState\.markCleanAfterSave/);
  assert.match(store, /DirtyState\.dirtyFragments/);
  assert.match(store, /DirtyState\.dirtyFragmentIdsForFile/);

  assert.doesNotMatch(store, /String\(fragment\.innerHTML/);
});

test('browser validation wrappers delegate to shared Validation', () => {
  const validation = readFileSync(new URL('../src/js/01-validation.js', import.meta.url), 'utf8');

  assert.match(validation, /Validation\.validateConfig/);
  assert.match(validation, /Validation\.validateManifestEntries/);
  assert.match(validation, /Validation\.validateMarkers/);
  assert.doesNotMatch(validation, /missing "workBranch"/);
  assert.doesNotMatch(validation, /duplicate cms marker id/);
});

test('config/settings code is split out of media library', () => {
  const config = readFileSync(new URL('../src/js/09-config-settings.js', import.meta.url), 'utf8');
  const media = readFileSync(new URL('../src/js/09-media.js', import.meta.url), 'utf8');

  assert.match(config, /loadGitCMSConfig/);
  assert.match(config, /openSettings/);
  assert.match(config, /saveConfig/);

  assert.doesNotMatch(media, /async function loadGitCMSConfig/);
  assert.doesNotMatch(media, /function openSettings/);
  assert.doesNotMatch(media, /async function saveConfig/);
});

test('token storage uses sessionStorage, not direct localStorage token writes', () => {
  const core = readFileSync(new URL('../src/js/00-core.js', import.meta.url), 'utf8');
  const connect = readFileSync(new URL('../src/js/03-connect-load.js', import.meta.url), 'utf8');
  const prefill = readFileSync(new URL('../src/js/16-prefill.js', import.meta.url), 'utf8');
  const misc = readFileSync(new URL('../src/js/15-misc-controls.js', import.meta.url), 'utf8');

  assert.match(core, /const TokenStorage/);
  assert.match(core, /sessionStorage\.setItem\(LS_TOKEN/);
  assert.match(core, /localStorage\.removeItem\(LS_TOKEN/);

  assert.match(connect, /TokenStorage\.write/);
  assert.match(prefill, /TokenStorage\.read/);
  assert.match(misc, /TokenStorage\.clear/);

  assert.doesNotMatch(connect, /localStorage\.setItem\(LS_TOKEN/);
  assert.doesNotMatch(prefill, /localStorage\.getItem\(LS_TOKEN/);
});

test('fragment parser browser files delegate to shared FragmentParser', () => {
  const fragments = readFileSync(new URL('../src/js/02-fragments.js', import.meta.url), 'utf8');
  const commit = readFileSync(new URL('../src/js/07-commit.js', import.meta.url), 'utf8');

  assert.match(fragments, /FragmentParser\.findMarkedFragments/);
  assert.match(fragments, /FragmentParser\.attrGet/);
  assert.match(fragments, /FragmentParser\.attrsDeclareFragment/);
  assert.match(fragments, /FragmentParser\.fragmentIdFromAttrs/);

  assert.match(commit, /FragmentParser\.replaceMarkedFragment/);
  assert.match(commit, /FragmentParser\.fragmentIdFromAttrs/);
  assert.match(commit, /FragmentParser\.attrsDeclareFragment/);

  for (const source of [fragments, commit]) {
    assert.doesNotMatch(source, /function reEsc\b/);
    assert.doesNotMatch(source, /function findTagEnd\b/);
    assert.doesNotMatch(source, /function findFirstElement\b/);
    assert.doesNotMatch(source, /function findMatchingClose\b/);
    assert.doesNotMatch(source, /function attrGet\b/);
    assert.doesNotMatch(source, /function classHasFragment\b/);
    assert.doesNotMatch(source, /function extractMarkedFragment\b/);
    assert.doesNotMatch(source, /function rebuildMarkedFragmentFromParts\b/);
  }
});
