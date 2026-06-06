# GitCMS v1.1 Refactor Source

This package is the first maintainability refactor of the stable GitCMS v1.1 admin.

## Goal

Keep the deployed admin as a single file, but make development easier.

```txt
src/index.html
src/admin.css
src/admin.js
build-admin.mjs
admin.html
```

## Files

| File | Purpose |
|---|---|
| `src/index.html` | Development HTML shell |
| `src/admin.css` | Admin UI CSS |
| `src/admin.js` | Admin logic |
| `build-admin.mjs` | Inlines CSS/JS into one file |
| `admin.html` | Built single-file admin for actual use |

## Build

Run from this folder:

```bash
node build-admin.mjs
```

This generates:

```txt
admin.html
```

## Recommended workflow

Edit:

```txt
src/admin.css
src/admin.js
src/index.html
```

Then build:

```bash
node build-admin.mjs
```

Commit the built `admin.html` if you want a single-file release in the repo.

## Refactor status

This is **refactor pass 1**:

- CSS extracted
- JS extracted
- build script added
- behavior intentionally unchanged

Next refactor passes should clean `src/admin.js` by sections:

1. GitHub API wrappers
2. config loading/saving
3. branch operations
4. fragment parsing/replacement
5. validation
6. media library
7. preview
8. publishing
9. diagnostics
10. UI event binding

Do not add new features during refactor passes.
