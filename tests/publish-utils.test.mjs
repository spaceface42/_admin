import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareUrl,
  displayFilePath,
  publishConflictInfo,
  statusLabel,
  summarizeCompare
} from '../src/lib/publish-utils.mjs';

test('statusLabel normalizes GitHub statuses', () => {
  assert.equal(statusLabel('removed'), 'deleted');
  assert.equal(statusLabel('added'), 'added');
  assert.equal(statusLabel('unknown'), 'unknown');
  assert.equal(statusLabel(''), 'changed');
});

test('displayFilePath shows rename source and target', () => {
  assert.equal(
    displayFilePath({
      status: 'renamed',
      previous_filename: 'old.html',
      filename: 'new.html'
    }),
    'old.html → new.html'
  );
});

test('summarizeCompare handles nothing to publish', () => {
  const summary = summarizeCompare({ files: [], ahead_by: 0 });
  assert.equal(summary.nothingToPublish, true);
  assert.equal(summary.total, 0);
});

test('summarizeCompare limits shown files and counts more', () => {
  const files = Array.from({ length: 45 }, (_, i) => ({
    status: 'modified',
    filename: `file-${i}.html`
  }));
  const summary = summarizeCompare({ files, ahead_by: 2 }, { limit: 40 });
  assert.equal(summary.shown.length, 40);
  assert.equal(summary.moreCount, 5);
  assert.equal(summary.ahead, 2);
});

test('compareUrl builds GitHub compare URL', () => {
  assert.equal(
    compareUrl({ owner: 'spaceface42', repo: '_blackhole', base: 'main', head: 'content' }),
    'https://github.com/spaceface42/_blackhole/compare/main...content'
  );
});

test('publishConflictInfo describes sync conflicts', () => {
  const info = publishConflictInfo(
    { status: 409, phase: 'sync-main-into-work' },
    {
      owner: 'spaceface42',
      repo: '_blackhole',
      base: 'main',
      head: 'content',
      workBranch: 'content',
      defaultBranch: 'main'
    }
  );

  assert.equal(info.kind, 'sync-conflict');
  assert.match(info.message, /auto-sync/);
  assert.match(info.url, /compare\/main...content/);
});

test('publishConflictInfo returns null for non-conflicts', () => {
  assert.equal(
    publishConflictInfo(
      { status: 403 },
      {
        owner: 'a',
        repo: 'b',
        base: 'main',
        head: 'content',
        workBranch: 'content',
        defaultBranch: 'main'
      }
    ),
    null
  );
});
