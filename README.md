# GitCMS Admin

A zero-backend GitHub CMS admin for editing HTML fragments in a separate content/site repository.

Current version:

```txt
1.1.59-format-fix
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
