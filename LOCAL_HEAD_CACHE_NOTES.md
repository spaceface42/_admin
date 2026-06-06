# GitCMS v1.1 Local Head Cache Build

This build addresses a persistent stale-admin-read issue where GitHub branch/ref reads can lag after a save.

## Symptom

After saving:

- live site can show the new content
- admin refresh/login still shows old content
- after 2–4 logins admin finally catches up

## Why previous fixes may still fail

Even if GitCMS reads through the Git data API, it still needs a branch commit SHA.

If GitHub's branch ref endpoint briefly returns the old SHA, GitCMS still reads the old blob.

## New fix

After every successful write, GitCMS stores the returned commit SHA in localStorage:

```txt
repo + branch → last known commit SHA
```

On the next refresh/login, when reading the `content` branch, GitCMS first uses that exact saved commit SHA.

That avoids waiting for GitHub's branch ref endpoint to catch up.

## TTL

The cached SHA expires after 15 minutes.
