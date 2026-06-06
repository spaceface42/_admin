# GitCMS

A small, zero-backend CMS for editing static HTML fragments through GitHub.

Current stable version:

```txt
1.1.28-release-hardening
```

## Branch model

```txt
content = CMS source of truth
main    = deploy target only
```

## Publish model

```txt
Save    -> content
Publish -> main
```

GitCMS does not merge `main` back into `content`.

## Runtime files

For the deployed CMS/site:

```txt
admin.html
gitcms.config.json
fragments.json
docs/
```

## Development files

For editing/building/testing GitCMS:

```txt
src/
tests/
build-admin.mjs
package.json
eslint.config.mjs
.prettierrc.json
.prettierignore
.github/workflows/quality.yml
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Recommended release check

Read and run:

```txt
MANUAL_REGRESSION_TEST.md
```

## Useful docs

```txt
STABLE.md
PUBLISH_WORKFLOW.md
RELEASE_CHECKLIST.md
```
