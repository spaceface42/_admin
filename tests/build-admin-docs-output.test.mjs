import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('build script writes admin.html to docs/admin.html for Pages hosting', () => {
  const buildScript = readFileSync(new URL('../build-admin.mjs', import.meta.url), 'utf8');

  assert.match(buildScript, /docsOutPath/);
  assert.match(buildScript, /\.\/docs\/admin\.html/);
  assert.match(buildScript, /writeFile\(docsOutPath, built/);
});

test('quality workflow verifies docs/admin.html exists after build', () => {
  const workflow = readFileSync(new URL('../.github/workflows/quality.yml', import.meta.url), 'utf8');

  assert.match(workflow, /Verify docs admin output/);
  assert.match(workflow, /test -s docs\/admin\.html/);
});
