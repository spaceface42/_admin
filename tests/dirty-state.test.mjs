import test from 'node:test';
import assert from 'node:assert/strict';
import {
  manifestLabelForFragment,
  isFragmentDirty,
  applyEditorValues,
  markCleanAfterSave,
  dirtyFragments,
  dirtyFragmentIdsForFile
} from '../src/lib/dirty-state.mjs';

const manifest = [
  { id: 'hero', label: 'Hero Section' },
  { id: 'intro', label: 'Introduction' }
];

test('manifestLabelForFragment returns manifest label or id fallback', () => {
  assert.equal(manifestLabelForFragment(manifest, { id: 'hero' }), 'Hero Section');
  assert.equal(manifestLabelForFragment(manifest, { id: 'missing' }), 'missing');
});

test('isFragmentDirty detects html changes', () => {
  assert.equal(
    isFragmentDirty(
      {
        id: 'hero',
        label: 'Hero Section',
        innerHTML: '<h1>New</h1>',
        origHTML: '<h1>Old</h1>'
      },
      manifest
    ),
    true
  );
});

test('isFragmentDirty detects label changes', () => {
  assert.equal(
    isFragmentDirty(
      {
        id: 'hero',
        label: 'Different',
        innerHTML: '<h1>Same</h1>',
        origHTML: '<h1>Same</h1>'
      },
      manifest
    ),
    true
  );
});

test('isFragmentDirty returns false when html and label match original state', () => {
  assert.equal(
    isFragmentDirty(
      {
        id: 'hero',
        label: 'Hero Section',
        innerHTML: '<h1>Same</h1>',
        origHTML: '<h1>Same</h1>'
      },
      manifest
    ),
    false
  );
});

test('applyEditorValues updates html, label and dirty flag', () => {
  const next = applyEditorValues(
    {
      id: 'hero',
      label: 'Hero Section',
      innerHTML: '<h1>Old</h1>',
      origHTML: '<h1>Old</h1>'
    },
    {
      html: '<h1>New</h1>',
      label: 'Hero Section'
    },
    manifest
  );

  assert.equal(next.innerHTML, '<h1>New</h1>');
  assert.equal(next.dirty, true);
});

test('markCleanAfterSave makes current html the new original html', () => {
  const next = markCleanAfterSave({
    id: 'hero',
    label: 'Hero Section',
    innerHTML: '<h1>Saved</h1>',
    origHTML: '<h1>Old</h1>',
    dirty: true
  });

  assert.equal(next.origHTML, '<h1>Saved</h1>');
  assert.equal(next.dirty, false);
});

test('dirtyFragments filters dirty fragments', () => {
  assert.deepEqual(
    dirtyFragments([
      { id: 'a', dirty: false },
      { id: 'b', dirty: true }
    ]).map((f) => f.id),
    ['b']
  );
});

test('dirtyFragmentIdsForFile returns dirty ids for one file', () => {
  const map = new Map([
    ['hero', { id: 'hero', dirty: true }],
    ['intro', { id: 'intro', dirty: false }]
  ]);

  assert.deepEqual(dirtyFragmentIdsForFile({ fragments: ['hero', 'intro'] }, map), ['hero']);
});

test('applyEditorValues preserves fields that are not supplied', () => {
  const next = applyEditorValues(
    {
      id: 'hero',
      label: 'Hero Section',
      innerHTML: '<h1>Old</h1>',
      origHTML: '<h1>Old</h1>'
    },
    {
      label: 'Hero Section'
    },
    manifest
  );

  assert.equal(next.innerHTML, '<h1>Old</h1>');
  assert.equal(next.dirty, false);
});
