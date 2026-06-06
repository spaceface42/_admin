# GitCMS v1.1 Refactor Source

This package contains the maintainable source version of the stable GitCMS v1.1 admin.

## Goal

Keep the deployed admin as a single file, but make development easier and the JS code cleaner.

```txt
src/index.html
src/admin.css
src/js/*.js
src/admin.js        # generated dev bundle
build-admin.mjs
admin.html          # generated single-file release
```

## Files

| File | Purpose |
|---|---|
| `src/index.html` | Development HTML shell |
| `src/admin.css` | Admin UI CSS |
| `src/js/*.js` | Refactored JS source modules |
| `src/admin.js` | Generated JS bundle for local/dev use |
| `build-admin.mjs` | Builds `src/admin.js` and single-file `admin.html` |
| `admin.html` | Built single-file admin for actual use |

## Build

Run from this folder:

```bash
node build-admin.mjs
```

This generates:

```txt
src/admin.js
admin.html
```

## JS module order

The JS is split into ordered files:

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

The numeric prefixes are intentional. They preserve load order.

## Refactor status

This is **refactor pass 2**:

- JS split by responsibility
- build script now concatenates JS modules
- `src/admin.js` is generated, not hand-edited
- behavior intentionally unchanged

## Development workflow

Edit:

```txt
src/js/*.js
src/admin.css
src/index.html
```

Then build:

```bash
node build-admin.mjs
```

Do not edit `src/admin.js` directly.
