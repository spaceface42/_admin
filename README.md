# GitCMS v1.1.4 Complete Codebase

This is the complete GitCMS codebase using the latest stable build:

```txt
GitCMS version: 1.1.4-content-tree-pinned-write
```

## Model

```txt
content = CMS source tree
main    = deploy target only
```

The admin reads editable CMS data from the `content` branch and publishes to `main`.

## Included

```txt
admin.html
gitcms.config.json
fragments.json
docs/
src/
tests/
build-admin.mjs
package.json
```

## Build

```bash
npm run build
```

or:

```bash
node build-admin.mjs
```

## Test

```bash
npm test
```

## Use

1. Rename/keep `admin.html`.
2. Create a `content` branch if needed.
3. Open `admin.html`.
4. Connect using a GitHub token with Contents read/write access.
5. Edit fragments.
6. Save to `content`.
7. Publish to `main`.

## Required GitHub token permission

Fine-grained PAT:

```txt
Contents: Read and write
```

## Recommended GitHub Pages setup

```txt
Branch: main
Folder: docs/
```
