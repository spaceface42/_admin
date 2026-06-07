import test from 'node:test';
import assert from 'node:assert/strict';
import {
  branchLabel,
  cleanRepoPart,
  configStatePatch,
  connectValidation,
  parseRepoUrl,
  repoSlug
} from '../src/lib/connect-utils.mjs';

test('parseRepoUrl parses https GitHub URLs', () => {
  assert.deepEqual(parseRepoUrl('https://github.com/spaceface42/_blackhole'), {
    owner: 'spaceface42',
    repo: '_blackhole'
  });
});

test('parseRepoUrl parses SSH GitHub URLs', () => {
  assert.deepEqual(parseRepoUrl('git@github.com:spaceface42/_blackhole.git'), {
    owner: 'spaceface42',
    repo: '_blackhole'
  });
});

test('parseRepoUrl parses owner/repo shorthand', () => {
  assert.deepEqual(parseRepoUrl('spaceface42/_blackhole'), {
    owner: 'spaceface42',
    repo: '_blackhole'
  });
});

test('parseRepoUrl removes query/hash/git suffix', () => {
  assert.deepEqual(parseRepoUrl('https://github.com/spaceface42/_blackhole.git?tab=readme#top'), {
    owner: 'spaceface42',
    repo: '_blackhole'
  });
});

test('parseRepoUrl rejects invalid input', () => {
  assert.equal(parseRepoUrl('not a repo'), null);
  assert.equal(parseRepoUrl(''), null);
});

test('cleanRepoPart removes .git and URL suffixes', () => {
  assert.equal(cleanRepoPart('_blackhole.git?x=1'), '_blackhole');
});

test('branchLabel creates readable label', () => {
  assert.equal(branchLabel('content-draft_branch'), 'Content Draft Branch');
});

test('configStatePatch extracts only valid config state fields', () => {
  assert.deepEqual(
    configStatePatch({
      workBranch: ' content ',
      manifestPath: ' fragments.json ',
      media: {}
    }),
    {
      workBranch: 'content',
      manifestPath: 'fragments.json'
    }
  );
});

test('connectValidation validates repo and token', () => {
  assert.equal(
    connectValidation({ repoUrl: 'bad input', token: 'abc' }),
    'Could not parse a github.com owner/repo from that URL.'
  );
  assert.equal(
    connectValidation({ repoUrl: 'spaceface42/_blackhole', token: '' }),
    'A token is required.'
  );
  assert.equal(connectValidation({ repoUrl: 'spaceface42/_blackhole', token: 'abc' }), '');
});

test('repoSlug joins owner and repo safely', () => {
  assert.equal(repoSlug({ owner: 'spaceface42', repo: '_blackhole' }), 'spaceface42/_blackhole');
  assert.equal(repoSlug({ owner: '', repo: '_blackhole' }), '');
});
