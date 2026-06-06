# GitCMS v1.1.4 Content Tree Pinned Write Build

This build fixes the remaining delayed-admin-load problem by using the exact commit SHA returned by a successful save.

## Problem

Even with the content-tree model, GitCMS still had to ask GitHub:

```txt
What commit does content point to?
```

If GitHub's branch/ref endpoint briefly returns the old commit, the admin reads the old content until GitHub catches up.

## Fix

After every successful write to `content`, GitHub returns the new commit SHA.

GitCMS now stores that SHA locally:

```txt
repo + branch -> last successful write commit SHA
```

For the next 30 minutes, when loading the `content` tree, GitCMS prefers that exact saved commit SHA.

So the flow becomes:

```txt
Save succeeds
→ GitHub returns new commit SHA
→ GitCMS stores SHA locally
→ refresh/login
→ GitCMS reads that exact commit tree
```

## Diagnostics

Expected fields:

```txt
GitCMS version: 1.1.4-content-tree-pinned-write
Main fallback: disabled
Content commit SHA: ...
Content tree source: last successful write
Pinned last write SHA: ...
```
