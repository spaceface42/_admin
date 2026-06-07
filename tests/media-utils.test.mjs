import test from 'node:test';
import assert from 'node:assert/strict';
import {
  altFromFilename,
  isImageFilename,
  mediaUsageList,
  sanitizeFilename,
  splitFilename,
  stampedUploadName,
  uniqueNameCandidate
} from '../src/lib/media-utils.mjs';

test('isImageFilename accepts supported image extensions', () => {
  assert.equal(isImageFilename('photo.PNG'), true);
  assert.equal(isImageFilename('photo.avif'), true);
  assert.equal(isImageFilename('document.pdf'), false);
});

test('sanitizeFilename normalizes unsafe filenames', () => {
  assert.equal(sanitizeFilename('My Great Photo!!.JPG'), 'my-great-photo.jpg');
  assert.equal(sanitizeFilename('Ä Ü test.png'), 'a-u-test.png');
});

test('sanitizeFilename falls back to image for empty base', () => {
  assert.equal(sanitizeFilename('!!!.png'), 'image.png');
});

test('altFromFilename creates readable alt text seed', () => {
  assert.equal(altFromFilename('2026-06-05-my_photo-file.png'), '2026 06 05 my photo file');
});

test('splitFilename handles files with and without extensions', () => {
  assert.deepEqual(splitFilename('photo.large.jpg'), { base: 'photo.large', ext: '.jpg' });
  assert.deepEqual(splitFilename('README'), { base: 'README', ext: '' });
});

test('uniqueNameCandidate appends suffix before extension', () => {
  assert.equal(uniqueNameCandidate('photo.jpg', 2), 'photo-2.jpg');
  assert.equal(uniqueNameCandidate('README', 3), 'README-3');
});

test('stampedUploadName includes index for multi-file uploads', () => {
  assert.equal(
    stampedUploadName({
      stamp: '2026-06-06-12-00-00',
      index: 1,
      total: 3,
      originalName: 'My Photo.JPG'
    }),
    '2026-06-06-12-00-00-2-my-photo.jpg'
  );
});

test('mediaUsageList finds URL and filename references', () => {
  const hits = mediaUsageList({
    mediaUrl: 'assets/media/photo.jpg',
    filename: 'photo.jpg',
    fragments: [
      {
        id: 'hero',
        label: 'Hero',
        path: 'docs/index.html',
        innerHTML: '<img src="assets/media/photo.jpg">'
      },
      { id: 'intro', label: 'Intro', path: 'docs/index.html', innerHTML: '<p>photo.jpg</p>' },
      { id: 'cta', label: 'CTA', path: 'docs/index.html', innerHTML: '<p>none</p>' }
    ]
  });

  assert.deepEqual(hits, ['Hero (docs/index.html)', 'Intro (docs/index.html)']);
});
