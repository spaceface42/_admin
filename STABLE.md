# GitCMS Stable Baseline

Current stable candidate:

```txt
1.1.28-release-hardening
```

Runtime lineage:

```txt
1.1.27-publish-workflow-docs
```

## Branch model

```txt
content = CMS source of truth
main    = deploy target only
```

## Save model

```txt
Save → content
```

The live site is not changed by save.

## Publish model

```txt
Deploy content → main
```

GitCMS does not merge `main` back into `content`.

## Stable admin file

Use the generated admin file as:

```txt
admin.html
```

## Expected publish behavior

After a successful publish:

```txt
main == content
```

The publish modal should show:

```txt
Nothing to publish
```

until a new edit is saved to `content`.

## Current critical fixes included

```txt
content-tree loading
pinned write commit reads
Blob URL preview
scrollable diagnostics modal
direct deploy publish model
local alignment cache after publish
publish ref/SHA stale-data guards
```

## Do not change before release

Avoid feature work until the manual regression test passes.

Feature work to postpone:

```txt
structured editor
Editor.js
new media workflows
new manifest schema
major UI redesign
```
