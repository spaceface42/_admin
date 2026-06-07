import test from 'node:test';
import assert from 'node:assert/strict';
import { refSha, refsPointToSameSha } from '../src/lib/publish-utils.mjs';

test('refSha extracts sha from GitHub ref shape', () => {
  assert.equal(refSha({ object: { sha: 'abc' } }), 'abc');
  assert.equal(refSha({ object: {} }), '');
  assert.equal(refSha(null), '');
});

test('refsPointToSameSha returns true only for matching non-empty refs', () => {
  assert.equal(refsPointToSameSha({ object: { sha: 'abc' } }, { object: { sha: 'abc' } }), true);
  assert.equal(refsPointToSameSha({ object: { sha: 'abc' } }, { object: { sha: 'def' } }), false);
  assert.equal(refsPointToSameSha({ object: { sha: '' } }, { object: { sha: '' } }), false);
});
