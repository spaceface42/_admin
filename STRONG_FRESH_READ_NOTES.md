# GitCMS v1.1 Strong Fresh Read Build

This build fixes a stronger stale-load case.

## Symptom

After saving a fragment:

- live site can show the new content
- admin refresh/login can still show old content
- after 2–4 logins, the admin finally shows the new content

## Cause

The first cache fix prevented browser/API HTTP caching, but GitHub's `/contents/:path?ref=content` lookup can still be briefly stale when `ref` is a branch name.

## Fix

For known branches like `content` and `main`, GitCMS now:

```txt
1. reads the branch ref
2. gets the exact commit SHA
3. reads file content using that commit SHA
```

So instead of relying on:

```txt
/contents/docs/index.html?ref=content
```

it effectively reads:

```txt
/contents/docs/index.html?ref=<current-content-commit-sha>
```

That should avoid branch-name content lookup lag.
