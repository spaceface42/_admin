# GitCMS v1.1 Cache-Fix Build

This build patches a stale-load issue.

## Problem

After saving a fragment, the live/site content could be correct, but after refreshing and logging back into the admin, the admin sometimes showed the older fragment for a few reconnects.

## Likely cause

The admin was reading stale GitHub API/browser cache responses immediately after a commit.

## Fix

`GitHubApi.request()` now does this for all GET requests:

- uses `fetch(..., { cache: "no-store" })`
- sends `Cache-Control: no-cache`
- sends `Pragma: no-cache`
- appends a `_gitcms_t=Date.now()` cache-busting query param

This makes the admin prefer fresh GitHub API data after saving.
