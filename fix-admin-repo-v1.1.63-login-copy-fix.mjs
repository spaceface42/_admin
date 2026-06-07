#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.63-login-copy-fix';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
}

function replaceOrFail(path, pattern, replacement, label) {
  const before = read(path);
  const after = before.replace(pattern, replacement);
  if (after === before) throw new Error(`Could not update ${label} in ${path}`);
  write(path, after);
}

// 1) Align versions.
if (existsSync('package.json')) {
  const pkg = JSON.parse(read('package.json'));
  pkg.version = VERSION;
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
}

replaceOrFail(
  'src/js/00-core.js',
  /const\s+GITCMS_VERSION\s*=\s*['"][^'"]+['"];/,
  `const GITCMS_VERSION = '${VERSION}';`,
  'GITCMS_VERSION'
);

replaceOrFail(
  'README.md',
  /Current version:\s*```txt\s*[\s\S]*?\s*```/,
  `Current version:\n\n\`\`\`txt\n${VERSION}\n\`\`\``,
  'README current version'
);

if (existsSync('src/js/17-backup.js')) {
  replaceOrFail(
    'src/js/17-backup.js',
    /version:\s*['"][^'"]+['"]/,
    `version: '${VERSION}'`,
    'backup metadata version'
  );
}

// 2) Fix login token-storage copy.
// Handles Prettier-wrapped multiline text and both em-dash / hyphen variants.
const indexPath = 'src/index.html';
const indexBefore = read(indexPath);
const sessionCopy =
  'Stored in sessionStorage for the current browser session. Older localStorage tokens are migrated once and removed.';

const indexAfter = indexBefore.replace(
  /Stored\s+in\s+localStorage\s*\(\s*base64\s*[—-]\s*obfuscation,\s*not\s+encryption\s*\)\s*\./g,
  sessionCopy
);

if (indexAfter === indexBefore) {
  throw new Error('Could not update login token-storage copy in src/index.html');
}

write(indexPath, indexAfter);

console.log(`Applied ${VERSION}.`);
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
console.log('  git add -A');
console.log('  git commit -m "Fix login token storage copy"');
console.log('  git push origin main');
