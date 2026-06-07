# GitCMS Admin

A zero-backend CMS for HTML-native static sites. No server, no database, no framework — one HTML file talking directly to the GitHub API from your browser.

---

## What makes it different

Most git-based CMSes treat **files** as content units — one markdown file, one page. GitCMS treats **fragments** as the unit: multiple named, editable regions inside a single HTML file. Your HTML is the source of truth, not generated from markdown.

- **Zero infrastructure.** Drop `docs/index.html` on any GitHub Pages repo and you're done.
- **Fragment-first.** Edit named HTML regions inline — headings, paragraphs, image alt text — without touching the surrounding markup.
- **Two-branch workflow.** Edits land on the `content` branch. Publishing merges to `main`. Nothing goes live until you say so.
- **Snapshot history.** Every publish creates a `snapshot-YYYY-MM-DD-HHMMSS` Git tag. One click to roll back both branches to any previous state.
- **Token in sessionStorage.** The GitHub PAT is validated on connect and cleared when the browser session ends. No server needed to keep it safe from the session.

---

## How it works

```txt
_admin repo     → hosts the CMS admin (this repo, built to docs/index.html)
_site repo      → your content/site repository
  content branch  = CMS editing source of truth
  main branch     = live published site
```

Connect with a GitHub repo URL and a personal access token. GitCMS resolves the config, creates the `content` branch if it doesn't exist, loads fragments from `fragments.json`, and you start editing.

---

## Getting started

```bash
npm install
npm run build
```

Open `admin.html` locally, or serve `docs/index.html` via GitHub Pages.

---

## Config

Add `gitcms.config.json` to your content repo:

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

## Editor snippets

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

Placeholder syntax: `{{text|Fallback}}`, `{{attr:text|Fallback}}`, `{{items|A\nB}}`

---

## Tests

```bash
npm test          # unit/source tests
npm run check     # syntax check
npm run quality   # build + check + test
npm run test:smoke  # Playwright browser tests (requires: npx playwright install chromium)
```

---

## Source layout

```txt
src/index.html        admin shell
src/admin.css         styles
src/js/               browser app modules (numbered load order)
src/lib/              shared utility modules (tested independently)
tests/                Node unit tests
smoke/                Playwright smoke tests
docs/                 GitHub Pages build output
```

---

## Build output

```txt
admin.html          standalone local admin
docs/index.html     GitHub Pages hosted admin
```

Built with esbuild. CSS and JS are inlined into a single self-contained HTML file.
