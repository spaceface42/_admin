import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('eslint config documents concatenated browser module handling', () => {
  const config = readFileSync(new URL('../eslint.config.mjs', import.meta.url), 'utf8');

  assert.match(config, /src\/js\/\*\*\/\*\.js/);
  assert.match(config, /concatenated by build-admin\.mjs/);
  assert.match(config, /['\"]no-undef['\"]\s*:\s*['\"]off['\"]/);
});

test('quality workflow keeps build output verification and quality steps', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/quality.yml', import.meta.url),
    'utf8'
  );

  assert.match(workflow, /npm run build/);
  assert.match(workflow, /test -s docs\/index\.html/);
  assert.match(workflow, /npm run format:check/);
  assert.match(workflow, /npm run lint/);
});
