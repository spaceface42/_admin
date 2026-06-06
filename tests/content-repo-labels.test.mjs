import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('login labels clearly refer to content/site repository', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

  assert.match(html, /Content \/ site repository URL/);
  assert.match(html, /admin-hosting repo/);
  assert.match(html, /site-content-repo/);
});

test('diagnostics labels distinguish content repo from admin repo', () => {
  const js = readFileSync(new URL('../src/js/13-diagnostics.js', import.meta.url), 'utf8');

  assert.match(js, /Content repository/);
  assert.match(js, /Content\/site repo/);
});
