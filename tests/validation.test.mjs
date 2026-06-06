import test from 'node:test';
import assert from 'node:assert/strict';
import { Validation } from '../src/lib/validation.mjs';

test('validateConfig accepts recommended config', () => {
  const warnings = Validation.validateConfig({
    workBranch:'content',
    media:{dir:'docs/assets/media',publicPrefix:'assets/media/'},
    preview:{css:['assets/style.css']},
    manifestPath:'fragments.json'
  }, {owner:'spaceface42',repo:'_blackhole'});
  assert.deepEqual(warnings, []);
});

test('validateConfig warns for project-site root-relative media prefix', () => {
  const warnings = Validation.validateConfig({
    workBranch:'content',
    media:{dir:'docs/assets/media',publicPrefix:'/assets/media/'},
    manifestPath:'fragments.json'
  }, {owner:'spaceface42',repo:'_blackhole'});
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /starts with "\/"/);
});

test('validateManifestEntries catches duplicates and missing fields', () => {
  const warnings = Validation.validateManifestEntries([
    {id:'hero',file:'docs/index.html',label:'Hero'},
    {id:'hero',file:'/docs/index.html'}
  ]);
  assert.ok(warnings.some(w => /duplicate fragment id/.test(w)));
  assert.ok(warnings.some(w => /missing "label"/.test(w)));
  assert.ok(warnings.some(w => /absolute file path/.test(w)));
});
