# GitCMS v1.1.35 Content Write Source Fix

Bug fix.

## Problem

Saving could still hit a write conflict because the commit path claimed to read the live
content file, but used `GitHubApi.getFile()`. For the work branch, that method reads
through the content-tree snapshot path, which can be cached/pinned for preview freshness.

That is correct for loading/preview, but not ideal for write SHA resolution.

## Fix

Added:

```txt
GitHubApi.getContentForWrite(path, branch)
GitHubApi.getFileForWrite(path, branch)
```

These read directly through the GitHub Contents API with:

```txt
?ref=content
```

No `main` fallback.
No cached content tree.
No preview snapshot.

Used for:

```txt
HTML file save
manifest label save
```

## Branch model

```txt
content = CMS source of truth
main    = deploy target only
```

## Version

```txt
1.1.35-content-write-source-fix
```
