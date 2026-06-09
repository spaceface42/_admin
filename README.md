# GitCMS Admin

Current version: `1.1.92-snapshot-create-registry-sync`.

Zero-backend CMS for HTML-native static sites. The admin is a static browser app that edits fragments in a separate GitHub content repository through the GitHub API.

## Repo model

```txt
_admin = CMS/admin repository
_site   = administered content/site repository

content = editing
main    = live published
```

Edits are saved to the configured work branch, normally `content`. Publishing moves the approved content to `main`. The admin repository is separate from the administered site repository.

## Security model

- Use a fine-grained GitHub PAT scoped only to the administered content/site repo.
- The repository URL is stored in `localStorage` for convenience.
- The GitHub token is stored only in `sessionStorage` and is cleared when the browser session ends.
- Saved values may be prefilled, but GitCMS does not auto-connect. Press **Connect** explicitly.

## Build

```bash
npm ci
npm run build
```

## Test

```bash
npm run check
npm test
npm run format:check
npm run lint
npm run quality
npm run test:smoke
```

`npm run test:smoke` requires Chromium for Playwright:

```bash
npx playwright install chromium
```

## Source layout

```txt
src/index.html        admin shell
src/admin.css         admin styles
src/js/               browser app modules, numbered by load order
src/lib/*.mjs         shared utility modules used by browser build and tests
tests/                Node unit/regression tests
smoke/                Playwright browser smoke tests
scripts/              build support scripts
docs/                 GitHub Pages build output
```

## Build output

```txt
admin.html            standalone local admin
docs/index.html       GitHub Pages hosted admin
```

## Content repo config

Add `gitcms.config.json` to the administered content/site repo:

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

## Fragment model

GitCMS treats named HTML fragments as the editable unit. Your HTML remains the source of truth; markdown generation is not required.

## Runtime behavior notes

Version marker: `1.1.88-readme-runtime-notes-fix`.

Saved repository values may be prefilled from local browser storage, but GitCMS does not auto-connect. The user must press **Connect** explicitly. Repository URL convenience state can live in `localStorage`; GitHub tokens must stay session-scoped in `sessionStorage`.

## History runtime clean implementation

Snapshot history is a runtime-only feature. The history button and modal are created by the browser runtime instead of being hard-coded in `src/index.html` static markup.

## Snapshot numbering

Snapshot cards are numbered deterministically by snapshot tag order: oldest snapshot = 1 and newest snapshot = total snapshot count.

## Snapshot cards and deletion

Snapshot history cards show a readable snapshot date and stable visual accent. Delete removes only the selected snapshot tag; it does not move `content`, `main`, or any branch ref.

## Rollback cache pinning

Rollback must pin content + main to rollback SHA before the editor reloads. This avoids stale branch-cache reads after the Git refs have moved.

## Rollback automatic editor refresh

After rollback moves the configured work branch and default branch, GitCMS performs a delayed reload so the editor refreshes from the rollback commit.

## Rollback does not create snapshots

Rollback does not create pre-rollback safety snapshots. snapshots represent published states only, so rollback simply moves branches back to a selected published snapshot.

## Docs output test rule

The build script writes the standalone local artifact to `admin.html` and writes the GitHub Pages hosted artifact to `docs/index.html`. The quality workflow verifies `docs/index.html` after `npm run build`.

## Named snapshots

Version target: `v1.1.89-named-snapshots`.

Snapshot names are human-facing metadata. Git tag names stay unchanged.

Snapshot-name metadata is stored on the separate `gitcms-metadata` branch, not on `content` or `main`. This prevents rollback from erasing `.gitcms/snapshots.json` when the selected snapshot commit predates the metadata file.

Names are stored in the administered content repository at:

```txt
.gitcms/snapshots.json
```

The internal snapshot tag remains the technical source of truth for rollback and delete actions.

Example:

```txt
Tag:
snapshot-2026-06-09-142210

Display name:
Homepage approved before client review
```

Rename behavior:

- `Rename` updates `.gitcms/snapshots.json` on the configured work branch.
- It does not rename the Git tag.
- It does not move `content` or `main`.
- It does not affect rollback/delete targeting.
- Empty rename clears the custom display name.

Snapshot names are trimmed, plain text only, and limited to 80 characters.

### Snapshot registry synchronization

Named snapshots use a synchronized registry stored at:

```txt
.gitcms/snapshots.json
```

The registry lives on the internal `gitcms-metadata` branch. Git tag names stay unchanged.

The live `snapshot-*` Git tags remain the source of truth for whether a snapshot exists. The registry stores display metadata for those tags: name, SHA, raw SHA, object type, created date, updated date, and future note/export fields.

History refresh reconciles the registry against live Git tags:

- new `snapshot-*` tags are added to `.gitcms/snapshots.json`
- deleted tags are removed from `.gitcms/snapshots.json`
- renamed snapshots update only their registry entry
- rollback never edits the registry branch
- delete removes the Git tag and the registry entry

The `gitcms-metadata` branch is metadata-only and should contain only `.gitcms/snapshots.json`.

### Publish-time snapshot registry sync

When publish creates a new `snapshot-*` Git tag, the admin immediately synchronizes the snapshot registry in `.gitcms/snapshots.json` on the `gitcms-metadata` branch.

History refresh still performs full reconciliation, so if publish-time registry sync fails because of a transient GitHub/API/cache issue, opening History later adds missing tags and removes stale deleted tags.
