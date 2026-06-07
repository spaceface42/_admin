import test from 'node:test';
import assert from 'node:assert/strict';
import { adminVersionStatus, inferGitHubPagesAdminRepo } from '../src/lib/diagnostics-utils.mjs';

test('inferGitHubPagesAdminRepo infers project repo from GitHub Pages URL', () => {
  assert.equal(
    inferGitHubPagesAdminRepo({
      hostname: 'spaceface42.github.io',
      pathname: '/_admin/admin.html'
    }),
    'https://github.com/spaceface42/_admin'
  );
});

test('inferGitHubPagesAdminRepo returns empty when repo cannot be inferred', () => {
  assert.equal(
    inferGitHubPagesAdminRepo({
      hostname: 'example.com',
      pathname: '/_admin/admin.html'
    }),
    ''
  );

  assert.equal(
    inferGitHubPagesAdminRepo({
      hostname: 'spaceface42.github.io',
      pathname: '/'
    }),
    ''
  );
});

test('adminVersionStatus compares current and expected versions', () => {
  assert.equal(adminVersionStatus({ currentVersion: '1.1.41', expectedVersion: '1.1.41' }), 'ok');

  assert.equal(
    adminVersionStatus({ currentVersion: '1.1.40', expectedVersion: '1.1.41' }),
    'version differs'
  );
});
