import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('README contains centralized runtime behavior notes', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /1.1.88-readme-runtime-notes-fix/);
  assert.match(readme, /History runtime clean implementation/);
  assert.match(readme, /Rollback cache pinning/);
  assert.match(readme, /Rollback does not create snapshots/);
  assert.match(readme, /Rollback automatic editor refresh/);
  assert.match(readme, /Snapshot cards and deletion/);
  assert.match(readme, /Snapshot numbering/);
  assert.match(readme, /Docs output test rule/);
});
