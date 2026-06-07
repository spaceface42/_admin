import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const rootAdmin = 'admin.html';
const docsDir = 'docs';
const docsIndex = join(docsDir, 'index.html');

if (!existsSync(rootAdmin)) {
  throw new Error('admin.html not found. Run the admin build first.');
}

if (!existsSync(docsDir)) {
  mkdirSync(docsDir, { recursive: true });
}

for (const entry of readdirSync(docsDir)) {
  const target = join(docsDir, entry);
  if (entry === 'index.html') continue;
  rmSync(target, { recursive: true, force: true });
}

copyFileSync(rootAdmin, docsIndex);

console.log('Synced admin.html -> docs/index.html');
console.log('Cleaned docs/ so it contains only index.html');
