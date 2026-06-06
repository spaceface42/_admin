# GitCMS v1.1.41 Diagnostics Admin Version

Diagnostics improvement.

## Added

New Diagnostics section:

```txt
Admin / version
```

It shows:

```txt
Current admin version
Expected stable version
Version status
Admin hosted URL
Admin origin
Admin path
Admin source repo
Content repo
```

## Admin source repo inference

When the admin is hosted from GitHub Pages, for example:

```txt
https://spaceface42.github.io/_admin/admin.html
```

GitCMS can infer:

```txt
https://github.com/spaceface42/_admin
```

## Behavior

No save, publish, cache, or content-loading logic changes.

## Version

```txt
1.1.41-diagnostics-admin-version
```
