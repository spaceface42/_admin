#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.72-publish-snapshot-direct';

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

function patchPublishDirectSnapshot() {
  const path = 'src/js/12-publish.js';
  let js = read(path);

  if (!js.includes('SNAPSHOT_TAG_PREFIX')) {
    js = js.replace(
      '/* ---------- publish ---------- */',
      `/* ---------- publish ---------- */
const SNAPSHOT_TAG_PREFIX = 'snapshot-';

function snapshotPad(n) {
  return String(n).padStart(2, '0');
}

function snapshotTimestamp(date = new Date()) {
  return (
    date.getFullYear() +
    '-' +
    snapshotPad(date.getMonth() + 1) +
    '-' +
    snapshotPad(date.getDate()) +
    '-' +
    snapshotPad(date.getHours()) +
    snapshotPad(date.getMinutes()) +
    snapshotPad(date.getSeconds())
  );
}

function snapshotTagName(date = new Date()) {
  return SNAPSHOT_TAG_PREFIX + snapshotTimestamp(date);
}

async function createSnapshotTagForPublish(sha) {
  if (!sha) throw new Error('Cannot create snapshot without a published commit SHA.');
  let lastError = null;

  for (let i = 0; i < 5; i++) {
    const base = snapshotTagName();
    const tagName = i === 0 ? base : base + '-' + (i + 1);

    try {
      await GitHubApi.request(GitHubApi.repoPath('/git/refs'), {
        method: 'POST',
        body: {
          ref: 'refs/tags/' + tagName,
          sha
        }
      });
      return tagName;
    } catch (e) {
      lastError = e;
      if (e.status !== 422) throw e;
      await sleep(1000);
    }
  }

  throw lastError || new Error('Could not create snapshot tag.');
}

async function createSnapshotAfterPublishResult(publishResult) {
  if (!publishResult || !publishResult.published || !publishResult.sha) return null;
  return createSnapshotTagForPublish(publishResult.sha);
}`
    );
  }

  // Baseline has: btn.textContent = 'Publishing…'; await publishContentToMain(); el('pubModal')...
  if (!js.includes('const publishResult = await publishContentToMain();')) {
    js = js.replace(
      /btn\.textContent = 'Publishing…';\s*await publishContentToMain\(\);/,
      `btn.textContent = 'Publishing…';
    const publishResult = await publishContentToMain();
    let snapshotTag = null;
    if (publishResult && publishResult.published && publishResult.sha) {
      try {
        snapshotTag = await createSnapshotAfterPublishResult(publishResult);
      } catch (snapshotErr) {
        console.warn('Snapshot creation after publish failed', snapshotErr);
        toast(
          'Published, but snapshot was not created: ' +
            GitHubErrors.githubErrorMessage(snapshotErr, { action: 'Create snapshot' }),
          'err'
        );
      }
    }`
    );
  }

  if (!js.includes('Snapshot: \' + snapshotTag')) {
    js = js.replace(
      /toast\('Published — main now matches content', 'ok'\);/,
      `toast(
      snapshotTag
        ? 'Published — main now matches content. Snapshot: ' + snapshotTag
        : 'Published — main now matches content',
      'ok'
    );`
    );
  }

  write(path, js);
}

function patchReadme() {
  let readme = read('README.md');

  if (!readme.includes('## Publish snapshots')) {
    readme += `

---

## Publish snapshots

After a successful publish, GitCMS creates a lightweight Git tag in the content/site
repository:

\`\`\`txt
snapshot-YYYY-MM-DD-HHMMSS
\`\`\`

The tag points to the same commit that was just published to the live branch.

This is intentionally wired directly into the real publish success path in
\`src/js/12-publish.js\`. Do not implement publish snapshots by wrapping or hijacking
button click handlers.
`;
  }

  write('README.md', readme);
}

function writeTests() {
  write(
    'tests/publish-snapshot-direct.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('publish module creates snapshot tags directly after successful publish', () => {
  const source = readFileSync(new URL('../src/js/12-publish.js', import.meta.url), 'utf8');

  assert.match(source, /SNAPSHOT_TAG_PREFIX = 'snapshot-'/);
  assert.match(source, /function snapshotTagName/);
  assert.match(source, /async function createSnapshotTagForPublish\\(sha\\)/);
  assert.match(source, /GitHubApi\\.request\\(GitHubApi\\.repoPath\\('\\/git\\/refs'\\)/);
  assert.match(source, /ref: 'refs\\/tags\\/' \\+ tagName/);
});

test('doPublish uses publish result SHA to create snapshot before success toast', () => {
  const source = readFileSync(new URL('../src/js/12-publish.js', import.meta.url), 'utf8');

  assert.match(source, /const publishResult = await publishContentToMain\\(\\)/);
  assert.match(source, /snapshotTag = await createSnapshotAfterPublishResult\\(publishResult\\)/);
  assert.match(source, /Published — main now matches content\\. Snapshot:/);
});

test('publish snapshots are not implemented by wrapping buttons', () => {
  const source = readFileSync(new URL('../src/js/12-publish.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /snapshotPublishWrappedClick/);
  assert.doesNotMatch(source, /const original = btn\\.onclick/);
});
`
  );
}

updateVersion();
patchPublishDirectSnapshot();
patchReadme();
writeTests();

console.log(`Applied ${VERSION}.`);
console.log('Snapshot tags are now created directly inside src/js/12-publish.js after publish succeeds.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
console.log('');
console.log('Manual test:');
console.log('  1. Open rebuilt admin.html');
console.log('  2. Connect to https://github.com/spaceface42/_blackhole');
console.log('  3. Save a content change');
console.log('  4. Publish to main');
console.log('  5. Check _blackhole/tags for snapshot-*');
console.log('');
console.log('Commit only after the snapshot tag appears:');
console.log('  git add -A');
console.log('  git commit -m "Create snapshot tags after publish"');
console.log('  git push origin main');
