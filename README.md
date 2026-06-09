# GitCMS Admin

Current version: `1.1.88-readme-runtime-notes-fix`.

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
