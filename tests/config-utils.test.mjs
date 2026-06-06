import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNextGitCMSConfig,
  configMediaObject,
  configPreviewObject,
  parsePreviewCssInput,
  settingsChanged,
  shouldPersistWorkBranch
} from '../src/lib/config-utils.mjs';

test('parsePreviewCssInput parses comma-separated CSS paths', () => {
  assert.deepEqual(parsePreviewCssInput('assets/a.css, assets/b.css, ,'), [
    'assets/a.css',
    'assets/b.css'
  ]);
});

test('parsePreviewCssInput accepts arrays', () => {
  assert.deepEqual(parsePreviewCssInput([' assets/a.css ', '', 'assets/b.css']), [
    'assets/a.css',
    'assets/b.css'
  ]);
});

test('configMediaObject and configPreviewObject safely return objects', () => {
  assert.deepEqual(configMediaObject({ media: { dir: 'docs/assets/media' } }), {
    dir: 'docs/assets/media'
  });
  assert.deepEqual(configMediaObject({ media: [] }), {});
  assert.deepEqual(configPreviewObject({ preview: { css: ['assets/style.css'] } }), {
    css: ['assets/style.css']
  });
  assert.deepEqual(configPreviewObject({ preview: 'bad' }), {});
});

test('shouldPersistWorkBranch preserves explicit config workBranch', () => {
  assert.equal(shouldPersistWorkBranch({ workBranch: 'content' }, 'content', 'content'), true);
});

test('shouldPersistWorkBranch persists non-default branch even if missing in existing config', () => {
  assert.equal(shouldPersistWorkBranch({}, 'draft', 'content'), true);
  assert.equal(shouldPersistWorkBranch({}, 'content', 'content'), false);
});

test('buildNextGitCMSConfig merges media and preview while preserving extra keys', () => {
  const next = buildNextGitCMSConfig(
    {
      extra: true,
      media: { maxSize: 123 },
      preview: { mode: 'page' }
    },
    {
      manifestPath: 'fragments.json',
      mediaDir: 'docs/assets/media',
      mediaPrefix: 'assets/media/',
      previewCss: 'assets/style.css, assets/theme.css',
      workBranch: 'content',
      defaultWorkBranch: 'content'
    }
  );

  assert.deepEqual(next, {
    extra: true,
    manifestPath: 'fragments.json',
    media: {
      maxSize: 123,
      dir: 'docs/assets/media',
      publicPrefix: 'assets/media/'
    },
    preview: {
      mode: 'page',
      css: ['assets/style.css', 'assets/theme.css']
    }
  });
});

test('buildNextGitCMSConfig keeps workBranch when non-default', () => {
  const next = buildNextGitCMSConfig(
    {},
    {
      manifestPath: 'fragments.json',
      mediaDir: 'docs/assets/media',
      mediaPrefix: 'assets/media/',
      previewCss: [],
      workBranch: 'draft',
      defaultWorkBranch: 'content'
    }
  );

  assert.equal(next.workBranch, 'draft');
});

test('settingsChanged compares serialized config objects', () => {
  assert.equal(settingsChanged({ a: 1 }, { a: 1 }), false);
  assert.equal(settingsChanged({ a: 1 }, { a: 2 }), true);
});
