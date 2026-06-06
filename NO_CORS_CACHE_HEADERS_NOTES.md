# GitCMS v1.1.2 Content Tree Build

This build keeps the content-tree source model but removes extra no-cache request headers.

## Why

The previous build could show:

```txt
Connection failed: Failed to fetch
```

in local `file://` usage.

The likely cause was stricter browser/CORS behavior caused by extra request headers:

```txt
Cache-Control
Pragma
```

## Changed

Removed those custom GET cache headers.

Freshness is still handled by the content-tree/blob read model:

```txt
content branch ref
→ commit
→ tree
→ blob
```

## Expected Diagnostics

```txt
GitCMS version: 1.1.2-content-tree
Main fallback: disabled
Content commit SHA: ...
Content tree SHA: ...
```
