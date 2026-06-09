import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('prefill does not auto-connect with restored session token', () => {
  const prefill = readFileSync(new URL('../src/js/16-prefill.js', import.meta.url), 'utf8');
  assert.match(prefill, /TokenStorage.read/);
  assert.match(prefill, /explicit Connect click/);
  assert.doesNotMatch(prefill, /connect()/);
});
