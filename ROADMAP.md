# Roadmap

This roadmap tracks the publishing system across the two repositories:

```txt
_admin     -> browser admin and GitHub API writer
_blackhole -> administered data, templates, generated docs, GitHub Actions
```

## Status

| Item | Status | Notes |
| --- | --- | --- |
| Batch saves into one commit | Done | `_admin` uses GitHub's Git Data API so one **Save to GitHub** creates one commit containing changed JSON, metadata, uploads, and deletions. |
| Show save/build status | Done | After save, `_admin` reports the save commit and polls the `_blackhole` **Build docs** workflow until success, failure, or timeout. |
| Validate paths and imports | Done | Config paths, page file paths, deleted page paths, pending upload paths, and imported backups are validated before save. |
| Better admin config | Partly done | `_blackhole/admin.config.json` now defines labels, field metadata, required fields, image limits, allowed image types, and public preview URL. The admin still uses a mostly fixed form layout. |
| Auto-refresh before save | Done | `_admin` checks whether the remote branch changed since the last load and asks before saving on top of newer remote data. |
| Draft/published workflow | Done | Unpublished records remain in JSON, and `_blackhole/scripts/build-site.js` skips `published: false` records when generating `docs/`. |
| Preview generated content | Done | `_admin` has a **Preview** button that renders the current form approximately like the public page before saving. |
| Cleaner generated site templates | Done | `_blackhole` supports `<database>`, `<database-list>`, and `<database-link>` tags. |
| Admin token handling | Done | `_admin` has a **Remember token** toggle and **Forget token** button. |
| Workflow reliability | Partly done | `_blackhole` has a manual `workflow_dispatch`, clear generated-docs commit behavior, and fixed workflow startup. A future version could use artifact deployment instead of committing `docs/`. |

## Recommended Next Version

The next worthwhile improvements are:

1. Make the admin form fully config-driven instead of fixed fields.
2. Add a build history panel with links to the last few workflow runs.
3. Add a public-site preview link per page.
4. Add optional Pages artifact deployment for repositories that do not want generated `docs/` committed.
5. Add stronger conflict handling that can show what changed remotely before saving.
