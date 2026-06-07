# GitCMS Admin

A zero-backend GitHub CMS admin for editing HTML fragments in a separate content/site repository.

Current version:

```txt
1.1.84-snapshot-delete-date-colors
```

---

## Repository Model

Recommended setup:

```txt
_admin     = admin app / GitHub Pages host
_blackhole = content/site repository
```

Branch model inside the content/site repo:

```txt
content = editing / CMS source branch
main    = live published branch
```

Keep this two-branch workflow. It prevents every save from going live immediately.

---

## Build Output

The build generates:

```txt
admin.html
docs/admin.html
```

`docs/admin.html` is intended for GitHub Pages when Pages publishes from `docs/`.

---

## Install

```bash
npm install
```

---

## Build

```bash
npm run build
```

The build uses `esbuild` when dependencies are installed.

The build pipeline:

```txt
src/lib/*.mjs              shared utility source of truth
src/js/*.js                browser app logic
build-admin.mjs            generates src/admin.js
admin.html                 standalone local/admin artifact
docs/admin.html            GitHub Pages artifact
```

---

## Test

Unit/source tests:

```bash
npm test
```

Syntax check:

```bash
npm run check
```

Quality check:

```bash
npm run quality
```

Browser smoke tests:

```bash
npx playwright install chromium
npm run build
npm run test:smoke
```

---

## Source Layout

```txt
src/index.html             admin shell
src/admin.css              admin styles
src/js/                    browser app logic
src/lib/                   shared utility modules used by tests and generated browser wrappers
tests/                     Node unit/source tests
smoke/                     Playwright smoke tests
docs/                      GitHub Pages output/sample site files
.github/workflows/         CI workflows
```

Manual duplicated browser utility files were removed. Shared utility logic lives in `src/lib/*.mjs`.

---

## Content Repo Config

The content/site repository may contain:

```txt
gitcms.config.json
fragments.json
docs/
```

Example `gitcms.config.json`:

```json
{
  "workBranch": "content",
  "manifestPath": "fragments.json",
  "media": {
    "dir": "docs/assets/media",
    "publicPrefix": "assets/media/"
  },
  "preview": {
    "css": ["assets/style.css"]
  }
}
```

---

## Configurable Editor Snippets

Snippets can be configured in `gitcms.config.json`:

```json
{
  "editor": {
    "snippets": [
      {
        "id": "alert",
        "label": "Alert box",
        "hint": "<div class=\"alert\">",
        "quick": true,
        "html": "<div class=\"alert\">\n  <p>{{text|Alert text}}</p>\n</div>"
      }
    ]
  }
}
```

Placeholder syntax:

```txt
{{text|Fallback text}}
{{attr:text|Fallback attribute text}}
{{items|First item\nSecond item}}
```

---

## Stable Notes

Current stable architecture:

```txt
content branch = CMS editing source of truth
main branch    = published live site
manifest-first loading for HTML fragments
direct Contents API for media thumbnails
single-file admin build
docs/admin.html copied during build
shared utility logic generated from src/lib/*.mjs
```

Do not add scattered release-note markdown files. Keep documentation centralized here unless a separate document is clearly necessary.

---

## Architecture cleanup notes

Current cleanup status:

```txt
dirty-state logic lives in src/lib/dirty-state.mjs
validation logic lives in src/lib/validation.mjs
fragment parser logic lives in src/lib/fragment-parser.mjs
browser wrappers delegate to shared lib-generated globals
config/settings code is split from media-library code
GitHub token uses sessionStorage, not localStorage
```

Known watch areas:

```txt
state is still a mutable global object behind a thin Store wrapper
fragment parsing is regex/depth based and should stay heavily tested
future releases should use clean release labels, not debug labels
```

---

## Publish snapshots

After a successful publish, GitCMS creates a lightweight Git tag in the content/site
repository:

```txt
snapshot-YYYY-MM-DD-HHMMSS
```

The tag points to the same commit that was just published to the live branch.

This is intentionally wired directly into the real publish success path in
`src/js/12-publish.js`. Do not implement publish snapshots by wrapping or hijacking
button click handlers.

---

## Snapshot history and rollback

The admin has a History button that lists tags matching:

```txt
snapshot-*
```

Rollback behavior:

```txt
1. create no extra rollback snapshot tag safety tag
2. move content branch to selected snapshot commit
3. move main branch to selected snapshot commit
4. clear cached write state
5. reload content
```

Snapshot tags are created automatically after a successful publish.

---

## Snapshot history modal implementation note

Snapshot history uses the standard modal structure:

```html
<div class="modal-bg" id="snapshotHistoryModal">
  <div class="modal media-modal">...</div>
</div>
```

The History module must not create the modal during startup, because the single-file build
can execute JavaScript before late static modal markup has been parsed. The modal is
created or reused only when History is opened.

---

## Rollback cache pinning

After rollback, GitHub branch-ref reads can lag briefly even when the ref update
request has already succeeded. The rollback flow therefore pins both branches in
`LastWriteCommitCache` to the selected snapshot SHA before calling `loadAll()`.

Do this:

```txt
update content ref
update main ref
pin content + main to rollback SHA
clear content tree
reload
```

Do not clear the write cache immediately after rollback, because that can make the
editor reload a stale branch ref.

---

## Rollback does not create snapshots

Rollback is a branch ref move only:

```txt
move content branch to selected snapshot SHA
move main branch to selected snapshot SHA
pin cache to selected snapshot SHA
reload editor
```

It does not create another `snapshot-*` tag. This keeps the tag list clean and makes
snapshots represent published states only.

---

## History button binding fallback

The History button has two bindings:

```txt
1. normal JS setup/delegated click binding
2. inline onclick fallback calling window.openSnapshotHistory()
```

The Snapshot History modal is kept in the static HTML before other modals, not appended
after the generated script. Runtime modal creation remains only as a fallback.

---

## History runtime modal only

The Snapshot History modal is not stored as static HTML in `src/index.html`.

Reason:

```txt
static modal inserts caused duplicate/malformed closing divs
runtime creation avoids index.html parser failures
```

The History button has an inline fallback:

```html
onclick="openSnapshotHistory(); return false;"
```

and `src/js/18-snapshot-history.js` exposes:

```js
window.openSnapshotHistory = openSnapshotHistory;
```

---

## History runtime clean implementation

Snapshot History is runtime-only:

```txt
src/index.html contains no Snapshot History modal
src/js/18-snapshot-history.js creates the button/modal at runtime
rollback moves content + main to the selected snapshot SHA
rollback pins LastWriteCommitCache to that SHA before reload
rollback does not create snapshot-before-rollback tags
```

This avoids malformed static modal markup in `src/index.html`.

---

## Rollback automatic editor refresh

After moving both branches to the selected snapshot SHA, Snapshot History automatically
reloads the editor twice:

```txt
1. immediate reload pinned to selected snapshot SHA
2. delayed reload after GitHub branch refs have settled
```

This mirrors clicking the normal Refresh button manually after rollback, so the editor
shows the rolled-back content without extra user action.

---

## Snapshot cards and deletion

History snapshot cards show a larger human-readable date parsed from the tag name:

```txt
snapshot-YYYY-MM-DD-HHMMSS
YYYY-MM-DD HH:MM:SS
```

Each card gets a deterministic accent color generated from the timestamp.

Snapshot cards also include a Delete action. Delete removes only the selected
`snapshot-*` Git tag. It does not move `content`, does not move `main`, and does
not change site content.
