import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticsStatusClass, diagnosticsTextSections } from '../src/lib/diagnostics-utils.mjs';

test('diagnosticsTextSections formats titled sections', () => {
  const text = diagnosticsTextSections([
    { title: 'Runtime', data: { Version: '1.0' } },
    {
      title: 'Cache / content source',
      data: { 'Cache status': 'ok — loaded content matches branch ref' }
    }
  ]);

  assert.match(text, /Runtime\n-------/);
  assert.match(text, /Version: 1\.0/);
  assert.match(text, /Cache \/ content source/);
  assert.match(text, /Cache status: ok/);
});

test('diagnosticsStatusClass marks cache warnings and ok states', () => {
  assert.equal(
    diagnosticsStatusClass('Cache status', 'warning — cached content SHA differs'),
    'warn'
  );
  assert.equal(
    diagnosticsStatusClass('Cache status', 'ok — loaded content matches branch ref'),
    'ok'
  );
});
