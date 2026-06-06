# GitCMS v1.1.37 Pinned SHA Validation

Bug fix.

## Problem

The admin can run from `_admin` while editing `_blackhole`. That is correct.

But the browser's local `LastWriteCommitCache` could still pin `_blackhole/content`
to an older commit SHA. In that case GitCMS might load old content even though the
real `content` branch had moved on.

## Fix

When loading the content tree, GitCMS now:

```txt
reads refs/heads/content
checks local pinned content SHA
if different, compares branchSha...cachedSha
uses cached SHA only if it is proven ahead
otherwise clears the stale cache and uses the branch ref
```

This keeps the original anti-lag behavior after Save, while preventing stale local
cache from overriding the real content branch.

## Branch model

```txt
_admin     = admin app host/repo
_blackhole = content/site repo
content    = CMS source of truth
main       = deploy target only
```

## Version

```txt
1.1.37-pinned-sha-validation
```
