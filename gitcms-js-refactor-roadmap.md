# GitCMS JS Refactor Roadmap

This roadmap starts from the current **GitCMS v1.1 refactor pass 3** state.

Current status:

```txt
Feature set:        v1.1 stable
Source split:       done
JS modules:         done
Build script:       done
GitHubApi wrapper:  started
Paths wrapper:      started
Store wrapper:      started
Pure libs/tests:    started
```

Primary goal:

```txt
Improve code quality without changing CMS behavior.
```

Do not add new user-facing features during the refactor phases.

---

## Refactor Principle

GitCMS should remain:

```txt
plain browser JavaScript
no framework
no backend
single-file build output
split source for development
```

The deployed file can stay:

```txt
admin.html
```

But development should happen in:

```txt
src/
  index.html
  admin.css
  js/
  lib/
tests/
build-admin.mjs
```

---

# Phase 0 — Current Baseline

## Already Done

### Source split

```txt
src/index.html
src/admin.css
src/js/*.js
src/admin.js
admin.html
build-admin.mjs
```

### JS modules by responsibility

```txt
src/js/00-core.js
src/js/01-validation.js
src/js/02-fragments.js
src/js/03-connect-load.js
src/js/04-rendering.js
src/js/05-snippets.js
src/js/06-editor-events.js
src/js/07-commit.js
src/js/08-image-alt.js
src/js/09-media.js
src/js/10-save-manifest.js
src/js/11-publish-summary.js
src/js/12-publish.js
src/js/13-diagnostics.js
src/js/14-external-links.js
src/js/15-misc-controls.js
src/js/16-prefill.js
```

### Initial helper objects

```txt
GitHubApi
Paths
Store
FragmentParser
Validation
```

### Initial pure libraries

```txt
src/lib/paths.mjs
src/lib/fragment-parser.mjs
src/lib/validation.mjs
```

### Initial tests

```txt
tests/paths.test.mjs
tests/fragment-parser.test.mjs
tests/validation.test.mjs
```

Current test result:

```txt
10 passed
0 failed
```

---

# Phase 1 — Finish GitHubApi Refactor

**Goal:** Remove direct GitHub REST path construction from the rest of the app.

## Tasks

### 1.1 Replace remaining `GitHubApi.request(...)` direct endpoint calls

Prefer named methods:

```js
GitHubApi.getContent(path, ref)
GitHubApi.putContent(path, body)
GitHubApi.deleteContent(path, body)
GitHubApi.merge(base, head, message)
GitHubApi.compare(base, head)
GitHubApi.pages()
GitHubApi.tree(ref)
```

Avoid this outside `00-core.js`:

```js
GitHubApi.request(`/repos/${state.owner}/${state.repo}/contents/...`)
```

### 1.2 Add missing named API methods

Add named wrappers for common operations:

```js
GitHubApi.getFile(path, ref)
GitHubApi.saveFile(path, { message, content, branch, sha })
GitHubApi.deleteFile(path, { message, sha, branch })
GitHubApi.getRecursiveTree(ref)
GitHubApi.getPagesInfo()
GitHubApi.createBranchFromSha(branch, sha)
```

### 1.3 Standardize API error shape

All GitHub errors should become:

```js
{
  status,
  message,
  context,
  raw
}
```

or an `Error` object with:

```js
error.status
error.context
error.detail
```

### 1.4 Add `errorMessageForGitHubError`

Create:

```js
function errorMessageForGitHubError(error, context) {}
```

Use it consistently for:

- token errors
- permission errors
- missing files
- missing branch
- merge conflicts
- rate limits

## Acceptance Criteria

- No raw `/repos/...` endpoint strings outside `GitHubApi`.
- All GitHub calls use named methods.
- User-facing errors are consistent.
- Existing behavior unchanged.

---

# Phase 2 — Finish Paths Refactor

**Goal:** Make all path handling centralized and testable.

## Tasks

### 2.1 Replace old wrapper usage

Current old wrappers can remain temporarily:

```js
ghPath()
normalizeRepoPath()
mediaPublicUrl()
rawUrlForRepoPath()
```

But internal code should gradually use:

```js
Paths.githubPath()
Paths.normalizeRepoPath()
Paths.mediaPublicUrl()
Paths.rawUrlForRepoPath()
```

### 2.2 Add more path tests

Add tests for:

```txt
/assets/media/image.jpg
assets/media/image.jpg
docs/assets/media/image.jpg
../bad/path
empty path
spaces
unicode filenames
query strings
hashes
srcset values
```

### 2.3 Extract preview path rewriting into pure functions

Move these into a testable lib:

```js
resolveRepoRelativeUrl()
rawUrlForPreviewAsset()
rewriteFullPageAssetUrls()
rewritePreviewUrls()
```

Suggested file:

```txt
src/lib/preview-paths.mjs
```

### 2.4 Add tests for preview path rewriting

Test:

```html
<link rel="stylesheet" href="assets/style.css">
<img src="assets/media/photo.jpg">
<img src="/assets/media/photo.jpg">
<img srcset="assets/a.jpg 1x, assets/b.jpg 2x">
```

## Acceptance Criteria

- Path logic lives in `Paths` or pure path libs.
- Preview/media/config path behavior has tests.
- No duplicate path normalization logic scattered through the app.

---

# Phase 3 — Finish FragmentParser Refactor

**Goal:** Make fragment parsing/replacement independent from app state.

## Current Issue

The browser-side parser still depends partly on:

```js
state
fileRec
state.manifest
state.frags
```

## Target API

Create pure API:

```js
FragmentParser.parseFile(content, {
  path,
  manifestEntries
})
```

Returns:

```js
{
  fragments: [],
  warnings: []
}
```

Each fragment should include:

```js
{
  id,
  markerId,
  mode,
  label,
  path,
  openTag,
  closeTag,
  innerHTML,
  origHTML
}
```

### 3.1 Refactor `parseFileFragments`

Current pattern:

```js
parseFileFragments(fileRec)
```

Better:

```js
const result = FragmentParser.parseFile(fileRec.content, {
  path: fileRec.path,
  manifestEntries
});
Store.addFragments(result.fragments);
```

### 3.2 Refactor `replaceFragment`

Move replacement logic into parser lib:

```js
FragmentParser.replaceFragment(content, fragment)
```

### 3.3 Add parser tests

Test:

- marker fragments
- nested sections
- missing end marker
- duplicate marker IDs
- old `<section class="fragment">` fallback
- `data-fragment` fallback
- mismatched marker/data-fragment
- replacing one fragment without touching others

## Acceptance Criteria

- Parser does not read or write global `state`.
- Parser can be tested in Node without DOM.
- Existing fragment behavior unchanged.

---

# Phase 4 — Finish Validation Refactor

**Goal:** Validation should produce data, not directly update UI.

## Target API

```js
Validation.validateConfig(config, context)
Validation.validateManifest(manifest, context)
Validation.validateMarkers(content, context)
Validation.validateLoadedFragments(manifest, fragments)
```

Return:

```js
[
  {
    kind: "config",
    severity: "warning",
    message: "...",
    file: "gitcms.config.json",
    fix: "..."
  }
]
```

## Tasks

### 4.1 Use structured warning objects

Current warnings are mostly strings.

Better:

```js
{
  kind: "markers",
  message: "cms:start hero has no matching cms:end hero",
  file: "docs/index.html",
  fix: "Add <!-- cms:end hero --> after the hero section."
}
```

### 4.2 Update Diagnostics renderer

Renderer should convert warning objects to HTML.

### 4.3 Add validation tests

Add tests for:

- missing config
- invalid config shape
- bad media prefix
- bad preview CSS
- duplicate fragment IDs
- manifest file mismatch
- missing label
- marker mismatch

## Acceptance Criteria

- Validation is pure.
- UI only renders validation results.
- Warnings are more useful and fix-oriented.

---

# Phase 5 — Store / State Cleanup

**Goal:** Reduce uncontrolled mutation of global `state`.

## Current State

`state` is still mutated directly in many places.

## Target

Use `Store` for meaningful state changes:

```js
Store.setRepo()
Store.setBranches()
Store.setConfig()
Store.clearLoadedContent()
Store.setLoadedFiles()
Store.setLoadedFragments()
Store.setActiveFragment()
Store.markFragmentDirty()
Store.updateFragmentHtml()
Store.updateFragmentLabel()
```

## Tasks

### 5.1 Add missing Store methods

Add:

```js
Store.setConfig(config)
Store.setFiles(files)
Store.setFragments(fragments)
Store.updateFragment(id, patch)
Store.markDirty(id)
Store.clearDirty(id)
Store.getActiveFragment()
Store.getFragmentsByFile(path)
Store.getDirtyFragments()
```

### 5.2 Replace direct state writes

Gradually replace:

```js
state.frags.set(...)
state.files.set(...)
state.activeId = ...
f.dirty = ...
f.innerHTML = ...
```

with Store methods.

### 5.3 Keep state readable

Do not over-abstract tiny reads.

This is fine:

```js
state.owner
state.repo
state.workBranch
```

But writes should become more controlled.

## Acceptance Criteria

- Major state writes go through `Store`.
- Dirty state behavior is consistent.
- Active fragment behavior is easier to follow.

---

# Phase 6 — UI Rendering Cleanup

**Goal:** Separate DOM rendering from business logic.

## Tasks

### 6.1 Create UI helper object

```js
const UI = {
  setStatus(),
  toast(),
  showError(),
  renderTree(),
  renderDiagnostics(),
  renderMediaGrid(),
  renderPublishSummary()
};
```

### 6.2 Move DOM-only functions into UI area

Functions like:

```js
renderTree()
renderMediaCard()
renderDiagnostics()
showMediaErr()
clearMediaErr()
```

should live in UI modules or have clear UI naming.

### 6.3 Keep pure logic out of UI functions

Example:

Bad:

```js
renderDiagnostics() {
  validateConfig();
  mutateState();
  renderHTML();
}
```

Better:

```js
const warnings = Validation.all();
UI.renderDiagnostics({ state, warnings });
```

## Acceptance Criteria

- Rendering functions mostly receive data and render HTML.
- Business logic no longer hides inside rendering.
- Easier to test non-UI behavior.

---

# Phase 7 — Editor and Preview Cleanup

**Goal:** Make editor/preview logic easier to reason about.

## Tasks

### 7.1 Editor module

Create:

```js
const Editor = {
  selectFragment(id),
  syncFromTextarea(),
  resetActive(),
  insertSnippet(type),
  insertAtCursor(textarea, text)
};
```

### 7.2 Preview module

Create:

```js
const Preview = {
  setMode(mode),
  renderFragment(fragment),
  renderPage(fragment),
  rewriteAssets(html, filePath)
};
```

### 7.3 Add preview tests

Pure asset rewriting should be tested in Node.

## Acceptance Criteria

- Editor state and preview state are separated.
- Preview rewrite logic has tests.
- Fragment/page preview behavior unchanged.

---

# Phase 8 — Media Module Cleanup

**Goal:** Make media upload/delete/copy behavior easier to maintain.

## Tasks

### 8.1 Media service

Create:

```js
const MediaService = {
  list(),
  upload(files),
  delete(item),
  exists(path),
  uniquePath(dir, name),
  usageList(path)
};
```

### 8.2 Media UI

Create:

```js
const MediaUI = {
  open(),
  renderGrid(items),
  renderCard(item),
  showWarning(),
  showError()
};
```

### 8.3 Add tests for filename/path behavior

Test:

- sanitize filename
- unique path naming
- public URL generation
- usage detection

## Acceptance Criteria

- GitHub operations are separate from card rendering.
- Collision behavior remains unchanged.
- Delete warnings remain unchanged.

---

# Phase 9 — Publishing Cleanup

**Goal:** Make publish flow safe and readable.

## Tasks

### 9.1 Publish service

Create:

```js
const PublishService = {
  loadSummary(),
  syncWorkBranchFromMain(),
  publish()
};
```

### 9.2 Separate conflict message logic

Create:

```js
publishErrorMessage(error)
```

### 9.3 Add tests for summary grouping later

If publish summary grouping is added, test it as a pure function.

## Acceptance Criteria

- Publish flow is readable top-to-bottom.
- Conflict handling remains clear.
- No behavior changes.

---

# Phase 10 — Tooling and Quality Gates

**Goal:** Prevent regressions.

## Current tooling

```json
{
  "scripts": {
    "build": "node build-admin.mjs",
    "check": "node --check src/admin.js",
    "test": "node --test"
  }
}
```

## Add later

### ESLint

```bash
npm install --save-dev eslint
```

Suggested scripts:

```json
{
  "lint": "eslint src/js/**/*.js src/lib/**/*.mjs tests/**/*.mjs"
}
```

### Prettier

```bash
npm install --save-dev prettier
```

Suggested scripts:

```json
{
  "format": "prettier --write src/**/*.js src/**/*.mjs src/**/*.css src/**/*.html tests/**/*.mjs"
}
```

### CI

Optional GitHub Actions:

```yaml
name: Check GitCMS

on:
  push:
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm test
      - run: npm run build
      - run: npm run check
```

## Acceptance Criteria

- Every refactor pass runs tests.
- Every refactor pass rebuilds `admin.html`.
- No behavior changes without intentional feature work.

---

# Phase 11 — Documentation Cleanup

**Goal:** Keep developer docs aligned with the refactor.

## Tasks

### 11.1 Update README_DEV.md

Document:

- module structure
- build flow
- testing flow
- source of truth files

### 11.2 Add architecture doc

Create:

```txt
ARCHITECTURE.md
```

Cover:

```txt
GitHubApi
Paths
Store
FragmentParser
Validation
UI
Media
Preview
Publish
```

### 11.3 Add contribution notes

Create:

```txt
CONTRIBUTING.md
```

Rules:

```txt
no feature changes during refactor
always run npm test
always run npm run build
admin.html is generated
edit src/js, not src/admin.js
```

---

# Recommended Next 5 Refactor Tasks

## 1. Complete GitHubApi named methods

Priority: very high

Reason:

```txt
Reduces duplicated API endpoint construction.
```

## 2. Complete FragmentParser pure API

Priority: very high

Reason:

```txt
Parser is the highest-risk part of GitCMS.
```

## 3. Complete Paths and preview path tests

Priority: high

Reason:

```txt
Path bugs cause broken media, CSS, and GitHub Pages previews.
```

## 4. Convert validation warnings to structured objects

Priority: medium/high

Reason:

```txt
Better diagnostics and better fix suggestions.
```

## 5. Expand Store usage for dirty fragments

Priority: medium

Reason:

```txt
Dirty state bugs are hard to debug later.
```

---

# Refactor Anti-Goals

Do not do these during refactor:

- add Editor.js again
- add new media features
- add multi-user locking
- add OAuth
- change branch workflow
- change marker format
- redesign UI
- change save/publish behavior

Keep behavior stable.

---

# Target End State

The ideal GitCMS source structure:

```txt
src/
  index.html
  admin.css
  js/
    00-core.js
    01-github-api.js
    02-paths.js
    03-store.js
    04-validation.js
    05-fragment-parser.js
    06-connect-load.js
    07-rendering.js
    08-editor.js
    09-preview.js
    10-commit.js
    11-media.js
    12-publish.js
    13-diagnostics.js
    14-events.js
  lib/
    paths.mjs
    fragment-parser.mjs
    validation.mjs
    preview-paths.mjs
tests/
  paths.test.mjs
  fragment-parser.test.mjs
  validation.test.mjs
  preview-paths.test.mjs
build-admin.mjs
admin.html
package.json
```

The deployed file remains:

```txt
admin.html
```

The code becomes:

```txt
testable
modular
behavior-preserving
easier to debug
safer to change
```

---

# Quality Checklist for Every Refactor Pass

Before calling a refactor pass done:

```bash
npm test
npm run build
npm run check
```

Also manually test:

```txt
connect
load fragments
edit
save
media upload
media insert
media delete
copy media URL
fragment preview
page preview
diagnostics
publish summary
publish
```

No feature behavior should change unless explicitly planned.
