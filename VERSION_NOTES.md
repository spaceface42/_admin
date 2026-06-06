# GitCMS v1.1.4 Version Notes

Stable version:

```txt
1.1.4-content-tree-pinned-write
```

## Important fixes

- `content` is treated as the CMS source tree.
- `main` is treated as deploy target only.
- Admin reads content branch files through a content-tree/blob model.
- After save, the exact returned commit SHA is pinned locally for immediate refresh/login correctness.
- Diagnostics shows source branch, main fallback status, content commit/tree SHA, and pinned write SHA.

## Diagnostics should show

```txt
GitCMS version: 1.1.4-content-tree-pinned-write
Main fallback: disabled
Content tree source: last successful write
Pinned last write SHA: ...
Content commit SHA: ...
Content tree SHA: ...
```
