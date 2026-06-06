# GitCMS v1.1.42 Content Repo Labels

UI clarity improvement.

## Problem

The admin can be hosted from one repo while editing another repo:

```txt
_admin     = admin app / GitHub Pages host
_blackhole = content/site repo
```

The login label could still be misunderstood as the admin-hosting repository.

## Changed

Login now says:

```txt
Content / site repository URL
```

and explains that this is the repo containing:

```txt
docs/
fragments.json
content branch
```

Diagnostics now uses clearer labels:

```txt
Content repository
Content repository URL
Content/site repo
```

## Behavior

No save, publish, cache, or GitHub API logic changes.

## Version

```txt
1.1.42-content-repo-labels
```
