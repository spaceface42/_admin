import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('diagnostics UI has collapsed advanced section support', () => {
  const js = readFileSync(new URL('../src/js/13-diagnostics.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/admin.css', import.meta.url), 'utf8');

  assert.match(js, /diagnosticsSummaryData/);
  assert.match(js, /appendDiagnosticsAdvanced/);
  assert.match(js, /Advanced diagnostics/);
  assert.match(css, /\.diag-advanced/);
});

test('visible diagnostics summary keeps key operational fields', () => {
  const js = readFileSync(new URL('../src/js/13-diagnostics.js', import.meta.url), 'utf8');

  assert.match(js, /Admin version/);
  assert.match(js, /Content repo/);
  assert.match(js, /Cache status/);
  assert.match(js, /Unsaved fragments/);
  assert.match(js, /Validation warnings/);
});
