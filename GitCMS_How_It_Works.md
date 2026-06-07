# GitCMS — How It Works

Current stable version:

```txt
1.1.83-rollback-auto-refresh
```

## 1. Purpose

GitCMS is a zero-backend CMS for editing a GitHub Pages site.

It has two separate roles:

```txt
_admin      = the CMS/admin tool
_blackhole  = the content/site repository
```

The admin edits the content repository through the GitHub API.

## 2. Repository setup

Typical setup:

```txt
_admin
  admin.html
  docs/admin.html
  src/
  tests/

_blackhole
  docs/
  fragments.json
  gitcms.config.json
  content branch
  main branch
```

The admin can be hosted separately from the content/site repo.

## 3. Branch model

The CMS uses two branches:

```txt
content = editing/draft branch
main    = live/published branch
```

Normal flow:

```txt
edit content
save to content
publish content to main
GitHub Pages deploys from main/docs
```

This is intentional. The content branch is the working branch. The main branch is the live branch.

## 4. Login

The admin requires:

```txt
GitHub repo URL
GitHub Personal Access Token
```

Example repo URL:

```txt
https://github.com/spaceface42/_blackhole
```

The token needs:

```txt
Contents: Read and write
```

The token is stored in:

```txt
sessionStorage
```

Older localStorage tokens are migrated once and removed.

## 5. Loading content

On connect, the admin loads:

```txt
gitcms.config.json
fragments.json
site/content files
media config
preview CSS
```

If `fragments.json` exists, it uses the manifest first.

If no manifest exists, it can scan the tree and generate one.

## 6. Editing

Fragments are marked in HTML with fragment markers.

The editor loads the selected fragment and lets you edit:

```txt
label
inner HTML
preview
```

When you click:

```txt
Save → Content
```

the admin writes only to the `content` branch.

It does not publish to the live site yet.

## 7. Publishing

When you click:

```txt
Publish to main
```

the admin updates `main` so it matches the current `content` branch state.

After publishing:

```txt
content SHA == main SHA
```

The live site should then deploy from:

```txt
main/docs
```

## 8. Snapshots

After a successful publish, the admin creates a lightweight Git tag in the content/site repo:

```txt
snapshot-YYYY-MM-DD-HHMMSS
```

Example:

```txt
snapshot-2026-06-07-185604
```

Snapshots are created only after publish.

They are not created on every edit or save.

## 9. History

The History UI is runtime-only.

That means:

```txt
src/index.html does not contain a static History modal
src/js/18-snapshot-history.js creates the History button/modal at runtime
```

History shows Git tags matching:

```txt
snapshot-*
```

Each snapshot can be opened on GitHub or used for rollback.

## 10. Rollback

Rollback moves both branches to the selected snapshot commit:

```txt
content → selected snapshot SHA
main    → selected snapshot SHA
```

Rollback does not create a new snapshot tag.

Rollback flow:

```txt
select snapshot
confirm rollback
update content branch ref
update main branch ref
pin cache to selected snapshot SHA
reload editor
wait briefly
reload editor again
```

The double refresh is intentional because GitHub branch refs can lag briefly after force-updating branches.

## 11. Backup ZIP

ZIP backup remains available as an advanced fallback.

Use it for:

```txt
manual export
offline backup
emergency restore
```

But normal history/rollback should use snapshot tags.

## 12. Media

Media files are stored in the configured media folder.

Typical config:

```txt
media folder: docs/assets/media
media URL prefix: assets/media/
```

The media library can:

```txt
upload images
show thumbnails
insert img tags
delete media files
```

Media changes are saved to `content` first and only become live after publishing to `main`.

## 13. Build

Admin source files are built into:

```txt
admin.html
docs/admin.html
```

Build command:

```bash
npm run build
```

If esbuild is unavailable, the fallback build still generates the admin from JS modules.

## 14. Tests

Before committing:

```bash
npm run format
npm run build
npm run format:check
npm run check
npm test
```

Expected result:

```txt
all tests pass
admin.html rebuilt
docs/admin.html rebuilt
```

## 15. Recommended workflow

Daily editing workflow:

```txt
open admin
connect to _blackhole
edit fragment
Save → Content
preview/check
Publish to main
snapshot tag is created automatically
```

Rollback workflow:

```txt
open History
choose snapshot
click Rollback
wait for automatic refresh
confirm editor shows rollback content
confirm main/content are both rolled back
```

## 16. Important rules

Do not edit live `main` directly unless necessary.

Do not create snapshot tags manually unless debugging.

Do not store the GitHub token inside committed files.

Do not add extra markdown docs unless necessary. Keep documentation centralized in `README.md`.

## 17. Current stable behavior

```txt
snapshot tags after publish: yes
History UI: yes, runtime-created
rollback content branch: yes
rollback main branch: yes
rollback creates new snapshot: no
editor auto-refresh after rollback: yes
ZIP backup: still available
```
