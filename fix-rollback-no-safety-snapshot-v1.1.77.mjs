#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.77-rollback-no-safety-snapshot';

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

function updateVersion() {
  const pkg = JSON.parse(read('package.json'));
  pkg.version = VERSION;
  write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

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
}

function findFunctionRange(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) return null;

  const braceStart = source.indexOf('{', start);
  let depth = 0;

  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }

  return null;
}

function removeFunction(source, name) {
  const range = findFunctionRange(source, name);
  if (!range) return source;
  return source.slice(0, range.start) + source.slice(range.end).replace(/^\n+/, '\n');
}

function patchRollbackNoSafetySnapshot() {
  const path = 'src/js/18-snapshot-history.js';
  if (!existsSync(path)) {
    throw new Error('src/js/18-snapshot-history.js not found. Apply snapshot history first.');
  }

  let js = read(path);

  js = js.replace(/const SNAPSHOT_ROLLBACK_PREFIX = 'snapshot-before-rollback-';\n/, '');
  js = removeFunction(js, 'snapshotHistoryCreatePreRollbackTags');
  js = removeFunction(js, 'snapshotHistoryCreateTag');

  js = js.replace(
    /Snapshot tags are created after publishing\. Rollback moves both\s+<span class="mono">content<\/span> and <span class="mono">main<\/span>\s+to the selected snapshot commit\./g,
    `Snapshot tags are created after publishing. Rollback moves both
        <span class="mono">content</span> and <span class="mono">main</span>
        to the selected snapshot commit. Rollback does not create a new snapshot tag.`
  );

  js = js.replace(
    /snapshotHistorySetWarn\(\s*tags\.length\s*\?\s*'<b>Rollback safety:<\/b> rollback creates a pre-rollback safety tag before moving branches\.'\s*:\s*''\s*\);/g,
    `snapshotHistorySetWarn(
      tags.length
        ? '<b>Rollback:</b> moves both content and main to the selected snapshot commit. No new snapshot tag is created.'
        : ''
    );`
  );

  js = js.replace(
    /      `Branches: \$\{state\.workBranch\} and \$\{state\.defaultBranch\}\\n\\n` \+\s*'A pre-rollback safety tag will be created first\.'/g,
    `      \`Branches: \${state.workBranch} and \${state.defaultBranch}\\n\\n\` +
      'No new snapshot tag will be created. The selected snapshot tag remains the restore point.'`
  );

  const oldRollbackBlock = `  snapshotHistorySetErr('');
  snapshotHistorySetWarn('Creating pre-rollback safety tag…');

  try {
    const safety = await snapshotHistoryCreatePreRollbackTags();

    snapshotHistorySetWarn('Rolling back content and main…');`;

  const newRollbackBlock = `  snapshotHistorySetErr('');
  snapshotHistorySetWarn('Rolling back content and main…');

  try {`;

  if (js.includes(oldRollbackBlock)) {
    js = js.replace(oldRollbackBlock, newRollbackBlock);
  } else {
    js = js.replace(
      /snapshotHistorySetWarn\('Creating pre-rollback safety tag…'\);\s*try \{\s*const safety = await snapshotHistoryCreatePreRollbackTags\(\);\s*snapshotHistorySetWarn\('Rolling back content and main…'\);/g,
      `snapshotHistorySetWarn('Rolling back content and main…');

  try {`
    );
  }

  js = js.replace(
    /    snapshotHistorySetWarn\(\s*`Rollback complete\.\$\{safety\.length \? ' Safety tag: ' \+ safety\.map\(esc\)\.join\(', '\) : ''\}`\s*\);/g,
    `    snapshotHistorySetWarn('Rollback complete. Both content and main now point to ' + esc(tag.name) + '.');`
  );

  if (js.includes('snapshotHistoryCreatePreRollbackTags')) {
    throw new Error('Pre-rollback tag creation still referenced in snapshot history module.');
  }

  if (js.includes('SNAPSHOT_ROLLBACK_PREFIX')) {
    throw new Error('SNAPSHOT_ROLLBACK_PREFIX still referenced in snapshot history module.');
  }

  write(path, js);
}

function patchReadme() {
  let readme = read('README.md');

  readme = readme.replace(/snapshot-before-rollback-\*/g, 'no extra rollback snapshot tag');
  readme = readme.replace(/create snapshot-before-rollback-\* safety tag\s*\n/gi, '');
  readme = readme.replace(/rollback creates a pre-rollback safety tag before moving branches/gi, 'rollback does not create a new snapshot tag');
  readme = readme.replace(/A pre-rollback safety tag[^.\n]*\./gi, 'No new snapshot tag is created on rollback.');

  if (!readme.includes('Rollback does not create snapshots')) {
    readme += `

---

## Rollback does not create snapshots

Rollback is a branch ref move only:

\`\`\`txt
move content branch to selected snapshot SHA
move main branch to selected snapshot SHA
pin cache to selected snapshot SHA
reload editor
\`\`\`

It does not create another \`snapshot-*\` tag. This keeps the tag list clean and makes
snapshots represent published states only.
`;
  }

  write('README.md', readme);
}

function writeTests() {
  write(
    'tests/snapshot-rollback-no-safety-tag.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('rollback does not create pre-rollback snapshot tags', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.doesNotMatch(js, /snapshot-before-rollback/);
  assert.doesNotMatch(js, /SNAPSHOT_ROLLBACK_PREFIX/);
  assert.doesNotMatch(js, /snapshotHistoryCreatePreRollbackTags/);
  assert.doesNotMatch(js, /Creating pre-rollback safety tag/);
});

test('rollback still moves both branches and pins cache to selected snapshot', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');

  assert.match(js, /GitHubApi\\.updateRef\\(state\\.workBranch, tag\\.sha, \\{ force: true \\}\\)/);
  assert.match(js, /GitHubApi\\.updateRef\\(state\\.defaultBranch, tag\\.sha, \\{ force: true \\}\\)/);
  assert.match(js, /LastWriteCommitCache\\.set\\(state\\.workBranch, tag\\.sha\\)/);
  assert.match(js, /LastWriteCommitCache\\.set\\(state\\.defaultBranch, tag\\.sha\\)/);
  assert.match(js, /Rollback complete\\. Both content and main now point to/);
});

test('README documents that rollback does not create snapshots', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Rollback does not create snapshots/);
  assert.match(readme, /snapshots represent published states only/);
});
`
  );

  // Replace earlier v1.1.73 expectations if still present.
  if (existsSync('tests/snapshot-history-rollback.test.mjs')) {
    let t = read('tests/snapshot-history-rollback.test.mjs');
    t = t.replace(/assert\.match\(js, \/snapshotHistoryCreatePreRollbackTags\/\);\n/g, '');
    t = t.replace(/assert\.match\(js, \/SNAPSHOT_ROLLBACK_PREFIX\/\);\n/g, '');
    t = t.replace(/assert\.match\(readme, \/snapshot-before-rollback\/\);\n/g, `assert.match(readme, /Rollback does not create snapshots/);\n`);
    write('tests/snapshot-history-rollback.test.mjs', t);
  }
}

updateVersion();
patchRollbackNoSafetySnapshot();
patchReadme();
writeTests();

console.log(`Applied ${VERSION}.`);
console.log('Rollback no longer creates pre-rollback/safety snapshot tags.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
console.log('');
console.log('Manual test: rollback to a snapshot and confirm no new snapshot-* tag appears.');
