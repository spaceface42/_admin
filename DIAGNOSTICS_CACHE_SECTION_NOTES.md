# GitCMS v1.1.38 Diagnostics Cache Section

UI/debugging improvement.

## Added

Diagnostics now has a dedicated section:

```txt
Cache / content source
```

It shows:

```txt
Default branch ref SHA
Content branch ref SHA
Cached default branch SHA
Cached content branch SHA
Loaded content commit SHA
Loaded content source
Loaded content tree SHA
Cache validation result
Cache decision
```

## Why

This makes it easy to see whether the admin is loading:

```txt
refs/heads/content
```

or a locally cached/pinned write SHA.

## Version

```txt
1.1.38-diagnostics-cache-section
```
