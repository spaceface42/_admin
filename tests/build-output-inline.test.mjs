import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('built admin.html is standalone with inlined CSS and JS', () => {
  const html = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');

  assert.match(html, /<style>\s*\/\*/);
  assert.match(html, /<script>\s*\/\*/);
  assert.doesNotMatch(html, /href=["']\.\/admin\.css["']/);
  assert.doesNotMatch(html, /src=["']\.\/admin\.js["']/);
});

test('built docs/index.html is standalone and matches root admin.html', () => {
  const root = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
  const docs = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');

  assert.equal(docs, root);
  assert.doesNotMatch(docs, /href=["']\.\/admin\.css["']/);
  assert.doesNotMatch(docs, /src=["']\.\/admin\.js["']/);
});

test('build script accepts formatted self-closing stylesheet link', () => {
  const script = readFileSync(new URL('../build-admin.mjs', import.meta.url), 'utf8');

  assert.match(script, /admin\.css/);
  assert.match(script, /\\s\*\\\/\?>/);
  assert.match(script, /Build failed to inline admin\.css/);
});
