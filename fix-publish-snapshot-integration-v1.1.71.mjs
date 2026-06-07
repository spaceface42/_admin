#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '1.1.71-publish-snapshot-integration';

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

function findFunctionRange(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) return null;

  const braceStart = source.indexOf('{', start);
  if (braceStart === -1) return null;

  let depth = 0;
  let inString = null;
  let inTemplate = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (inTemplate) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '`') inTemplate = false;
      // This simple scanner intentionally ignores ${} nesting. It is only used
      // on small function blocks and replacement falls back safely if needed.
      continue;
    }

    if (ch === '/' && next === '/') {
      lineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }

  return null;
}

function replaceFunction(source, name, replacement) {
  const range = findFunctionRange(source, name);
  if (!range) throw new Error(`Could not find function ${name}`);
  return source.slice(0, range.start) + replacement + source.slice(range.end);
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

function patchSnapshotsModule() {
  const path = 'src/js/18-snapshots.js';
  if (!existsSync(path)) {
    throw new Error('src/js/18-snapshots.js not found. Apply the snapshot/history module first.');
  }

  let js = read(path);

  if (!js.includes('function snapshotHasRepoConnection()')) {
    js = js.replace(
      /function snapshotSetErr\(msg\) \{/,
      `function snapshotHasRepoConnection() {
  return !!(state && state.owner && state.repo && state.token);
}

function snapshotRequireRepoConnection() {
  if (snapshotHasRepoConnection()) return true;

  ensureSnapshotModal();
  snapshotSetErr('');
  snapshotSetWarn('Connect to a content/site repository first. Snapshots are stored as Git tags in that repository.');
  snapshotRenderList([]);
  return false;
}

function snapshotSetErr(msg) {`
    );
  }

  if (!js.includes('async function snapshotCreateForPublishSha(')) {
    js = js.replace(
      /async function snapshotAfterPublish\(\) \{/,
      `async function snapshotCreateForPublishSha(sha, { quiet = false } = {}) {
  if (!snapshotHasRepoConnection()) {
    throw new Error('Connect to a content/site repository before creating snapshots.');
  }
  if (!sha) throw new Error('Cannot create snapshot without a publish SHA.');

  const tag = await snapshotCreateTag(sha);
  if (!quiet) toast('Publish snapshot created: ' + tag, 'ok');
  return tag;
}

async function snapshotAfterPublish() {`
    );
  }

  if (js.includes('function hookPublishSnapshots(')) {
    js = replaceFunction(
      js,
      'hookPublishSnapshots',
      `function hookPublishSnapshots() {
  // No-op by design.
  // Snapshot creation is now wired directly into the real publish success path
  // in src/js/12-publish.js. Button wrapping was fragile and caused publishes
  // to complete without creating snapshot tags.
}`
    );
  }

  write(path, js);
}

function patchPublishPath() {
  const path = 'src/js/12-publish.js';
  if (!existsSync(path)) throw new Error('src/js/12-publish.js not found');

  let js = read(path);

  if (!js.includes('snapshotCreateForPublishSha(publishResult.sha')) {
    js = js.replace(
      /btn\.textContent = 'Publishing…';\s*await publishContentToMain\(\);/,
      `btn.textContent = 'Publishing…';
    const publishResult = await publishContentToMain();

    let snapshotTag = null;
    if (
      publishResult &&
      publishResult.published &&
      publishResult.sha &&
      typeof snapshotCreateForPublishSha === 'function'
    ) {
      try {
        snapshotTag = await snapshotCreateForPublishSha(publishResult.sha, { quiet: true });
      } catch (snapshotErr) {
        console.warn('Publish snapshot creation failed', snapshotErr);
        toast(
          'Published, but snapshot was not created: ' +
            GitHubErrors.githubErrorMessage(snapshotErr, { action: 'Create snapshot' }),
          'err'
        );
      }
    }`
    );
  }

  js = js.replace(
    /toast\('Published — main now matches content', 'ok'\);/,
    `toast(
      snapshotTag
        ? 'Published — main now matches content. Snapshot: ' + snapshotTag
        : 'Published — main now matches content',
      'ok'
    );`
  );

  write(path, js);
}

function patchReadme() {
  let readme = read('README.md');
  if (!readme.includes('Snapshot creation is wired directly into publish success')) {
    readme += `

---

## Snapshot publish integration

Snapshot tags are created in the content/site repository after a successful publish to
the live branch.

Important implementation rule:

\`\`\`txt
publish success path calls snapshot creation directly
do not wrap/hijack the publish button click handler
\`\`\`

This ensures snapshots are created even if UI button handlers are reassigned.
`;
  }
  write('README.md', readme);
}

function writeTests() {
  write(
    'tests/publish-snapshot-integration.test.mjs',
    `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('publish success path directly creates snapshot tag', () => {
  const publish = readFileSync(new URL('../src/js/12-publish.js', import.meta.url), 'utf8');

  assert.match(publish, /const publishResult = await publishContentToMain\\(\\)/);
  assert.match(publish, /typeof snapshotCreateForPublishSha === 'function'/);
  assert.match(publish, /snapshotCreateForPublishSha\\(publishResult\\.sha, \\{ quiet: true \\}\\)/);
  assert.match(publish, /Published — main now matches content\\. Snapshot:/);
});

test('snapshot module exposes publish SHA snapshot helper', () => {
  const snapshots = readFileSync(new URL('../src/js/18-snapshots.js', import.meta.url), 'utf8');

  assert.match(snapshots, /async function snapshotCreateForPublishSha\\(sha/);
  assert.match(snapshots, /snapshotCreateTag\\(sha\\)/);
  assert.match(snapshots, /Cannot create snapshot without a publish SHA/);
});

test('old publish button wrapping is disabled', () => {
  const snapshots = readFileSync(new URL('../src/js/18-snapshots.js', import.meta.url), 'utf8');

  assert.match(snapshots, /function hookPublishSnapshots\\(\\)/);
  assert.match(snapshots, /No-op by design/);
  assert.doesNotMatch(snapshots, /const original = btn\\.onclick/);
  assert.doesNotMatch(snapshots, /snapshotPublishWrappedClick/);
});
`
  );
}

updateVersion();
patchSnapshotsModule();
patchPublishPath();
patchReadme();
writeTests();

console.log(`Applied ${VERSION}.`);
console.log('Snapshot creation is now wired directly into the real publish success path.');
console.log('');
console.log('Next:');
console.log('  npm run format');
console.log('  npm run build');
console.log('  npm run format:check');
console.log('  npm run check');
console.log('  npm test');
console.log('');
console.log('Manual test: connect to _blackhole, make a content change, Save → Content, Publish to main, then check _blackhole/tags for snapshot-*.');
console.log('');
console.log('Commit only after local publish creates a snapshot tag:');
console.log('  git add -A');
console.log('  git commit -m "Create snapshots directly after publish"');
console.log('  git push origin main');
