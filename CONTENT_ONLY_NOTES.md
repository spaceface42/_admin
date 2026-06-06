# GitCMS v1.1 Content-Only Build

This build disables silent fallback to `main`.

## Why

The admin still had fallback paths where it could load manifest/files from `main` when the `content` branch manifest or fragments did not match.

That can make the live site look correct while the admin appears stale or inconsistent.

## Changed

Editable CMS data now loads only from:

```txt
content
```

No fallback to:

```txt
main
```

for:

- `fragments.json`
- HTML files referenced by fragments
- tree scan fallback

## Still allowed

During initial connect only, the admin may read `gitcms.config.json` from `main` before it knows the configured work branch. After `content` exists, config reload uses `content`.

## Diagnostics

Diagnostics now shows:

```txt
CMS source branch: content
Main fallback: disabled
```
