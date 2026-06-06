# GitCMS v1.1 Git Data Read Build

This build addresses a persistent stale-admin-read problem.

## Symptom

After editing and saving a fragment:

- the live site shows the correct content
- logging into admin immediately may still show old content
- after several logins, admin eventually shows the correct content

## Earlier fixes

Previous builds tried:

- `fetch(..., { cache: "no-store" })`
- `Cache-Control: no-cache`
- cache-busting query params
- resolving branch name to commit SHA before `/contents` reads

That was still not enough.

## This build

For source files like:

```txt
gitcms.config.json
fragments.json
docs/index.html
docs/about.html
docs/contact.html
```

GitCMS now reads through the lower-level Git data API:

```txt
refs/heads/content
→ commit SHA
→ commit tree SHA
→ recursive tree
→ matching blob SHA
→ blob content
```

So instead of depending on:

```txt
/contents/docs/index.html?ref=content
```

GitCMS reads the actual blob from the commit tree.

Directory listings, such as media folder listing, still use the Contents API.
