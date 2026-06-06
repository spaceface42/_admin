# GitCMS v1.1.39 Diagnostics Clear Cache

UI/debugging improvement.

## Added

Diagnostics now has a button:

```txt
Clear local cache
```

## Behavior

When clicked, GitCMS:

```txt
clears cached write SHAs for the current repo
clears the loaded content tree
reloads refs/heads/content without using pinned write cache
refreshes Diagnostics
```

## Why

If local browser cache ever causes confusion, the user can recover from the UI
without disconnecting, logging out, or clearing browser storage manually.

## Version

```txt
1.1.39-diagnostics-clear-cache
```
