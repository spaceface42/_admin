import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('package exposes Playwright smoke test script', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  assert.equal(pkg.scripts['test:smoke'], 'playwright test');
  assert.ok(pkg.devDependencies['@playwright/test']);
});

test('browser smoke workflow exists and runs smoke script', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/browser-smoke.yml', import.meta.url),
    'utf8'
  );

  assert.match(workflow, /GitCMS Browser Smoke/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /npm run test:smoke/);
});
