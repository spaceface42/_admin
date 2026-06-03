# Roadmap

This roadmap tracks the publishing system across the two repositories:

```txt
_admin     -> browser admin and GitHub API writer
_blackhole -> administered data, templates, generated site, GitHub Actions
```

## Status

| Item | Status | Notes |
| --- | --- | --- |
| Batch saves into one commit | Done | `_admin` uses GitHub's Git Data API so one **Save to GitHub** creates one commit containing changed JSON, metadata, uploads, and deletions. |
| Show save/build status | Done | After save, `_admin` reports the save commit and polls the `_blackhole` site build workflow until success, failure, or timeout. |
| Validate paths and imports | Done | Config paths, page file paths, deleted page paths, pending upload paths, and imported backups are validated before save. |
| Better admin config | Partly done | `_blackhole/admin.config.json` now defines labels, field metadata, required fields, image limits, allowed image types, and public preview URL. The admin still uses a mostly fixed form layout. |
| Auto-refresh before save | Done | `_admin` checks whether the remote branch changed since the last load and asks before saving on top of newer remote data. |
| Draft/published workflow | Done | Unpublished records remain in JSON, and `_blackhole/scripts/build-site.js` skips `published: false` records when generating the site. |
| Preview generated content | Done | `_admin` has a **Preview** button that renders the current form approximately like the public page before saving. |
| Cleaner generated site templates | Done | `_blackhole` supports per-type templates, partials, `<database>`, `<database-list>`, `<database-link>`, and menu rendering from JSON. |
| Navigation editor | Done | `_admin` edits `data/navigation.json` so menu labels, order, and targets can change without editing templates. |
| Admin token handling | Done | `_admin` has a **Remember token** toggle and **Forget token** button. |
| Workflow reliability | Done | `_blackhole` deploys the generated `_docs/` folder through GitHub Pages artifacts instead of committing generated HTML. |

## Recommended Next Version

The next worthwhile improvements are:

1. Make the admin form fully config-driven instead of fixed fields.
2. Add a build history panel with links to the last few workflow runs.
3. Add a public-site preview link per page.
4. Add richer admin support for discovering available templates from the administered repo.
5. Add stronger conflict handling that can show what changed remotely before saving.
