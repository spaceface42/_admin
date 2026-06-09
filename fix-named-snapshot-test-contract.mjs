#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const path = 'src/js/18-snapshot-history.js';

function read(p) {
  return readFileSync(p, 'utf8');
}

function write(p, s) {
  writeFileSync(p, s, 'utf8');
  console.log('updated ' + p);
}

function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    throw new Error('No replacement matched for ' + label);
  }
  console.log('fixed ' + label);
  return next;
}

if (!existsSync(path)) {
  throw new Error('Run this from the _admin repo root. Missing ' + path);
}

let js = read(path);

// Keep the existing test contract. The previous implementation/tests expect media-modal.
js = replaceRequired(
  js,
  /<div class="modal wide">/,
  '<div class="modal media-modal">',
  'snapshot history modal class'
);

// Keep rollback status text as the tests expect, without changing behavior.
js = replaceRequired(
  js,
  /snapshotHistorySetWarn\('Rollback complete\.<br>Refreshing editor from rollback commit…'\);/,
  "snapshotHistorySetWarn('Rollback complete. Refreshing editor from rollback commit…');",
  'rollback refresh status text'
);

// Keep final rollback status text as a single sentence so existing regex tests match.
js = replaceRequired(
  js,
  /snapshotHistorySetWarn\(`Rollback complete\.\s*Both content and main now point to \$\{esc\(tag\.name\)\}\.`\);/m,
  "snapshotHistorySetWarn('Rollback complete. Both content and main now point to ' + esc(tag.name) + '.');",
  'rollback final status text'
);

write(path, js);

console.log('');
console.log('Now run:');
console.log('  npm run build');
console.log('  npm test');
console.log('  npm run quality');
