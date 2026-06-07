# GitCMS v1.1.52 Media Thumbnails Contents API

Bug fix.

## Problem

v1.1.51 introduced manifest-first loading. That intentionally avoids loading a
recursive tree when `fragments.json` exists.

Media thumbnails were still using:

```txt
GitHubApi.getFile(item.path, state.workBranch)
```

For the content branch, `getFile()` uses the content-tree/blob read path. In
manifest-first mode, the tree is not loaded, so media thumbnails could fail.

## Fix

Media thumbnail loading now uses the direct GitHub Contents API:

```txt
GitHubApi.getContent(item.path, state.workBranch)
```

This reverts the media thumbnail read path only.

## Unchanged

Manifest-first loading for HTML fragments remains active.

No changes to:

```txt
save
publish
content loading for fragments
cache validation
branch model
```

## Version

```txt
1.1.52-media-thumbs-contents-api
```
