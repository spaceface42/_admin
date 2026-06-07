import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticsBadgeText, diagnosticsRowMeta } from '../src/lib/diagnostics-utils.mjs';

test('diagnosticsBadgeText maps status classes to labels', () => {
  assert.equal(diagnosticsBadgeText('ok'), 'OK');
  assert.equal(diagnosticsBadgeText('warn'), 'CHECK');
  assert.equal(diagnosticsBadgeText(''), '');
});

test('diagnosticsRowMeta detects SHA rows', () => {
  const row = diagnosticsRowMeta(
    'Content branch ref SHA',
    '474fc177a151f856ef77b8452be054b33a9223c6'
  );

  assert.equal(row.isSha, true);
  assert.equal(row.value, '474fc177a151f856ef77b8452be054b33a9223c6');
});

test('diagnosticsRowMeta does not treat short SHA as full copyable SHA', () => {
  const row = diagnosticsRowMeta('Content branch short SHA', '474fc17…a9223c6');
  assert.equal(row.isSha, false);
});
