import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diagnosticsRows,
  diagnosticsStatusClass,
  diagnosticsText,
  diagnosticsWorkflowNote
} from '../src/lib/diagnostics-utils.mjs';

test('diagnosticsStatusClass marks unsaved fragments as warning', () => {
  assert.equal(diagnosticsStatusClass('Unsaved fragments', '2'), 'warn');
  assert.equal(diagnosticsStatusClass('Unsaved fragments', '0'), '');
});

test('diagnosticsStatusClass marks valid key connection fields as ok', () => {
  assert.equal(diagnosticsStatusClass('Repository', 'spaceface42/_blackhole'), 'ok');
  assert.equal(diagnosticsStatusClass('Repository', 'not connected'), '');
  assert.equal(diagnosticsStatusClass('Default branch', 'unknown'), '');
});

test('diagnosticsRows converts data to display rows', () => {
  assert.deepEqual(diagnosticsRows({ Repository: 'a/b', 'Unsaved fragments': '1' }), [
    { key: 'Repository', value: 'a/b', statusClass: 'ok', badge: 'OK', isSha: false },
    { key: 'Unsaved fragments', value: '1', statusClass: 'warn', badge: 'CHECK', isSha: false }
  ]);
});

test('diagnosticsText appends validation warnings', () => {
  const text = diagnosticsText(
    { Repository: 'a/b' },
    [{ kind: 'config', msg: 'missing media dir' }]
  );
  assert.match(text, /Repository: a\/b/);
  assert.match(text, /Validation warnings/);
  assert.match(text, /config: missing media dir/);
});

test('diagnosticsWorkflowNote fills defaults', () => {
  assert.deepEqual(
    diagnosticsWorkflowNote({ workBranch: '', defaultBranch: '', mediaDir: '', mediaPrefix: '' }),
    {
      workBranch: 'content',
      defaultBranch: 'main',
      mediaDir: 'not set',
      mediaPrefix: 'not set'
    }
  );
});
