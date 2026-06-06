# GitCMS v1.1 Content Tree Model

This build makes the CMS source model explicit:

```txt
content = CMS source tree
main    = deploy target only
```

## What changed

On connect/load, GitCMS resolves a single content branch tree snapshot:

```txt
refs/heads/content
→ commit SHA
→ tree SHA
→ recursive tree
```

Then CMS source files are read from blobs in that content tree.

This applies to:

- `gitcms.config.json` after branch setup
- `fragments.json`
- HTML files
- tree scan fallback

## What does not happen anymore

GitCMS does not load editable CMS data from `main`.

`main` is only used for:

- initial creation of `content` if the branch does not exist
- publish/deploy target
- publish summary/merge operations

## Diagnostics

Diagnostics shows:

```txt
CMS source branch
Main fallback
Content commit SHA
Content tree SHA
```
