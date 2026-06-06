# GitCMS v1.1.31 Path/Media Wrappers Module

Small architecture cleanup.

## Goal

Move thin path/media wrapper helpers out of:

```txt
src/js/00-core.js
```

into:

```txt
src/js/02-path-media-wrappers.js
```

## Moved

```txt
ghPath
normalizeRepoPath
defaultPublicPrefixFor
normalizePublicPrefix
mediaDir
mediaPrefix
contentAssetRef
previewCssList
publicPathToRepoPath
rawUrlForRepoPath
previewCssTags
mediaPublicUrl
mimeFromName
```

## Behavior

No intended runtime behavior change.

## Version

```txt
1.1.31-path-media-wrappers-module
```
