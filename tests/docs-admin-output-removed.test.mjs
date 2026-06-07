import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';

test('docs output uses index.html, not admin.html', () => {
  const docsUrl = new URL('../docs', import.meta.url);
  const entries = existsSync(docsUrl) ? readdirSync(docsUrl).sort() : [];

  assert.deepEqual(entries, ['index.html']);
  assert.equal(existsSync(new URL('../docs/index.html', import.meta.url)), true);
  assert.equal(existsSync(new URL('../docs/admin.html', import.meta.url)), false);
});
