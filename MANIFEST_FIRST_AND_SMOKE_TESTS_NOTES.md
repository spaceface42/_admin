# GitCMS v1.1.51 Manifest-First Load and Smoke Tests

Performance and reliability improvement.

## 1. Manifest-first loading

GitCMS now avoids the initial recursive tree scan when `fragments.json` exists.

New load flow:

```txt
resolve content branch commit
read fragments.json via Contents API at that commit
read only files listed in fragments.json
parse fragments
only fall back to recursive tree scan if manifest is missing or unusable
```

This reduces GitHub API work for normal CMS loads.

## 2. Browser smoke tests

Added Playwright smoke tests under:

```txt
smoke/admin.smoke.spec.mjs
```

The smoke tests check:

```txt
standalone admin renders
CSS is inlined
JS is inlined
login screen appears
dynamic snippet controls initialize
no browser boot errors
```

Run locally with:

```bash
npm install
npx playwright install chromium
npm run build
npm run test:smoke
```

A separate GitHub Actions workflow was added:

```txt
.github/workflows/browser-smoke.yml
```

## No branch model change

The branch model stays:

```txt
content = editing / CMS source of truth
main    = live published site
```

## Version

```txt
1.1.51-manifest-first-load-and-smoke-tests
```
