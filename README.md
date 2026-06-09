# GitCMS Admin

Current version: `1.1.88`.

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
