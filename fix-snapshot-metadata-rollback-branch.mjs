#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const JS_PATH = 'src/js/18-snapshot-history.js';
const TEST_PATH = 'tests/named-snapshots.test.mjs';
const README_PATH = 'README.md';

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
  console.log('updated ' + path);
}

function replaceRequired(source, pattern, replacement, label) {
  const next = typeof pattern === 'string'
    ? source.replace(pattern, replacement)
    : source.replace(pattern, replacement);
  if (next === source) {
    throw new Error('No replacement matched for ' + label);
  }
  console.log('fixed ' + label);
  return next;
}

if (!existsSync(JS_PATH)) {
  throw new Error('Run this from the _admin repo root. Missing ' + JS_PATH);
}

let js = read(JS_PATH);

// Add stable metadata branch constant.
if (!js.includes("const SNAPSHOT_METADATA_BRANCH = 'gitcms-metadata';")) {
  js = replaceRequired(
    js,
    "const SNAPSHOT_METADATA_PATH = '.gitcms/snapshots.json';\nconst SNAPSHOT_NAME_MAX_LENGTH = 80;",
    "const SNAPSHOT_METADATA_PATH = '.gitcms/snapshots.json';\nconst SNAPSHOT_METADATA_BRANCH = 'gitcms-metadata';\nconst SNAPSHOT_NAME_MAX_LENGTH = 80;",
    'snapshot metadata branch constant'
  );
}

// Replace the metadata load/save section so snapshot names live outside rollback-controlled branches.
const metadataBlock = `async function snapshotHistoryEnsureMetadataBranch() {
  try {
    await GitHubApi.getRef(SNAPSHOT_METADATA_BRANCH);
    return SNAPSHOT_METADATA_BRANCH;
  } catch (e) {
    if (!e || e.status !== 404) throw e;
  }

  const sourceBranch = state.workBranch || state.defaultBranch || DEFAULT_WORK_BRANCH;
  const sourceRef = await GitHubApi.getRef(sourceBranch);
  const sourceSha = sourceRef && sourceRef.object && sourceRef.object.sha ? sourceRef.object.sha : '';

  if (!sourceSha) {
    throw new Error('Could not create snapshot metadata branch: source branch SHA is missing.');
  }

  try {
    await GitHubApi.createBranchFromSha(SNAPSHOT_METADATA_BRANCH, sourceSha);
  } catch (e) {
    // Race-safe: another browser/session may have created it after our 404.
    if (!e || e.status !== 422) throw e;
  }

  return SNAPSHOT_METADATA_BRANCH;
}

async function snapshotHistoryLoadMetadata() {
  let branch = SNAPSHOT_METADATA_BRANCH;

  try {
    branch = await snapshotHistoryEnsureMetadataBranch();
    const file = await GitHubApi.getFileForWrite(SNAPSHOT_METADATA_PATH, branch);
    const parsed = JSON.parse(dec(file.content));
    return {
      metadata: snapshotHistoryNormalizeMetadata(parsed),
      sha: file.sha || null,
      branch,
      warning: ''
    };
  } catch (e) {
    if (e && e.status === 404) {
      return {
        metadata: snapshotHistoryEmptyMetadata(),
        sha: null,
        branch,
        warning: ''
      };
    }

    console.warn('Could not load snapshot metadata', e);
    return {
      metadata: snapshotHistoryEmptyMetadata(),
      sha: null,
      branch,
      warning: 'Snapshot names metadata could not be read. Showing tag/date fallback names.'
    };
  }
}

async function snapshotHistorySaveMetadata(metadataState, metadata) {
  const clean = snapshotHistoryNormalizeMetadata(metadata);
  const content = JSON.stringify(clean, null, 2) + '\\n';
  const branch =
    metadataState && metadataState.branch ? metadataState.branch : await snapshotHistoryEnsureMetadataBranch();

  await GitHubApi.saveFile(SNAPSHOT_METADATA_PATH, {
    message: 'cms: update snapshot names',
    content: enc(content),
    branch,
    sha: metadataState && metadataState.sha ? metadataState.sha : null
  });
}
`;

js = replaceRequired(
  js,
  /async function snapshotHistoryLoadMetadata\(\) \{[\s\S]*?\n\}\n\nasync function snapshotHistorySaveMetadata\(metadataState, metadata\) \{[\s\S]*?\n\}\n\nfunction snapshotHistoryValidateName/,
  metadataBlock + '\nfunction snapshotHistoryValidateName',
  'snapshot metadata load/save branch isolation'
);

// Update modal copy.
js = js.replace(
  /Custom snapshot names are stored in <code>\$\{esc\(SNAPSHOT_METADATA_PATH\)\}<\/code> on\s*<code>\$\{esc\(state\.workBranch \|\| DEFAULT_WORK_BRANCH\)\}<\/code>\. Git tag names stay unchanged\./,
  'Custom snapshot names are stored in <code>${esc(SNAPSHOT_METADATA_PATH)}</code> on the <code>${esc(SNAPSHOT_METADATA_BRANCH)}</code> metadata branch. Git tag names stay unchanged.'
);

write(JS_PATH, js);

// Patch named snapshot tests if present.
if (existsSync(TEST_PATH)) {
  let test = read(TEST_PATH);

  if (!test.includes("SNAPSHOT_METADATA_BRANCH = 'gitcms-metadata'")) {
    test = test.replace(
      /assert\.match\(js, \/const SNAPSHOT_METADATA_PATH = '\\\\.gitcms\\\/snapshots\\\\.json'\/\);/,
      "assert.match(js, /const SNAPSHOT_METADATA_PATH = '\\\\.gitcms\\\\/snapshots\\\\.json'/);\n  assert.match(js, /const SNAPSHOT_METADATA_BRANCH = 'gitcms-metadata'/);"
    );
  }

  test = test.replace(
    /snapshot rename commits only snapshots\.json on the work branch/g,
    'snapshot rename commits only snapshots.json on the metadata branch'
  );

  if (!test.includes('snapshotHistoryEnsureMetadataBranch')) {
    test = test.replace(
      /assert\.match\(js, \/async function snapshotHistoryLoadMetadata\\\(\\\)\/\);/,
      "assert.match(js, /async function snapshotHistoryEnsureMetadataBranch\\(\\)/);\n  assert.match(js, /async function snapshotHistoryLoadMetadata\\(\\)/);"
    );
  }

  if (!test.includes('rollback-controlled content branch')) {
    test += `

test('snapshot names are isolated from rollback-controlled content branches', () => {
  const js = readFileSync(new URL('../src/js/18-snapshot-history.js', import.meta.url), 'utf8');
  const loadStart = js.indexOf('async function snapshotHistoryLoadMetadata');
  const saveEnd = js.indexOf('function snapshotHistoryValidateName', loadStart);
  const metadataBody = js.slice(loadStart, saveEnd);

  assert.match(metadataBody, /SNAPSHOT_METADATA_BRANCH/);
  assert.doesNotMatch(metadataBody, /state\\.workBranch\\)/);
  assert.match(js, /gitcms-metadata/);
});
`;
  }

  write(TEST_PATH, test);
}

// Patch README documentation if present.
if (existsSync(README_PATH)) {
  let readme = read(README_PATH);

  if (!readme.includes('gitcms-metadata')) {
    readme = readme.replace(
      /(## Named snapshots[\s\S]*?Git tag names stay unchanged[^\n]*\n?)/,
      `$1\nSnapshot-name metadata is stored on the separate \`gitcms-metadata\` branch, not on \`content\` or \`main\`. This prevents rollback from erasing \`.gitcms/snapshots.json\` when the selected snapshot commit predates the metadata file.\n`
    );
  }

  write(README_PATH, readme);
}

console.log('');
console.log('Hotfix applied.');
console.log('');
console.log('Now run:');
console.log('  npm run build');
console.log('  npm test');
console.log('  npm run quality');
console.log('');
console.log('Then commit:');
console.log('  git add -A');
console.log('  git commit -m "Keep snapshot metadata outside rollback branches"');
console.log('  git push');
