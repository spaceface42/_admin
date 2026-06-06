# GitCMS Publish Workflow

Current stable model:

```txt
content = CMS source of truth
main    = deploy target only
```

## Save

When editing content in the admin:

```txt
Save → content
```

The live site is not changed yet.

## Publish

Publishing deploys the current content branch to the live branch:

```txt
content → main
```

GitCMS does not merge `main` back into `content`.

## Why direct deploy?

`content` is the canonical CMS tree. `main` exists so GitHub Pages can deploy from `docs/`.

The correct publish operation is therefore:

```txt
resolve effective content commit SHA
force-update main to that SHA
pin main/content locally as aligned
```

## Expected behavior

After a successful publish:

```txt
main == content
```

The Publish button should become unavailable until a new change is saved to `content`.

## Troubleshooting

If Publish appears available immediately after publishing:

1. Open Diagnostics.
2. Confirm the version is current.
3. Check the GitHub compare view:

```txt
main...content
```

If GitHub says the branches are identical, the admin should also show `Nothing to publish`.

## Token permission

The GitHub token must be able to write repository contents/refs:

```txt
Contents: Read and write
```
