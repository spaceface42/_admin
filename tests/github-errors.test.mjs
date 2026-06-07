import test from 'node:test';
import assert from 'node:assert/strict';
import {
  githubErrorKind,
  githubErrorMessage,
  isNetworkFetchError
} from '../src/lib/github-errors.mjs';

test('isNetworkFetchError detects browser fetch failures', () => {
  assert.equal(isNetworkFetchError(new TypeError('Failed to fetch')), true);
  assert.equal(isNetworkFetchError({ status: 403, message: 'Forbidden' }), false);
});

test('githubErrorMessage handles auth errors', () => {
  assert.equal(
    githubErrorMessage({ status: 401, message: 'Bad credentials' }, { action: 'Connect' }),
    'Connect failed: bad or expired token.'
  );
});

test('githubErrorMessage handles permission errors', () => {
  assert.match(
    githubErrorMessage({ status: 403, message: 'Forbidden' }, { action: 'Save' }),
    /token probably lacks/
  );
});

test('githubErrorMessage handles not found errors', () => {
  assert.match(
    githubErrorMessage({ status: 404, message: 'Not Found' }, { action: 'Load file' }),
    /repository, branch, path, or file was not found/
  );
});

test('githubErrorMessage handles conflicts with custom message', () => {
  assert.equal(
    githubErrorMessage(
      { status: 409, message: 'Conflict' },
      { action: 'Save', conflict: 'Custom conflict' }
    ),
    'Custom conflict'
  );
});

test('githubErrorKind categorizes common statuses', () => {
  assert.equal(githubErrorKind(new TypeError('Failed to fetch')), 'network');
  assert.equal(githubErrorKind({ status: 403 }), 'permission');
  assert.equal(githubErrorKind({ status: 409 }), 'conflict');
  assert.equal(githubErrorKind({ status: 500 }), 'github-server');
});
