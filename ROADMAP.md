# GitCMS Snapshot History & Backup Roadmap

This roadmap defines the next snapshot/history improvements for GitCMS Admin.

The goal is to make snapshots easier to understand, export, store, and restore without making the Git history fragile.

## Core rule

Snapshot Git tags must remain immutable.

A snapshot may receive a human-friendly name, but the underlying Git tag must not be renamed.

Example:

```txt
Internal tag:
gitcms-snapshot-2026-06-09T12-22-10Z

Display name:
Homepage approved before client review
```

The tag remains the technical source of truth. The display name is metadata only.

---

## Phase 1 — Named Snapshots

### Version target

```txt
v1.1.89-named-snapshots
```

### Goal

Allow users to rename snapshots with a clear human-readable label.

Instead of relying only on snapshot number and date, the history UI should display a custom name.

Example:

```txt
Homepage approved before client review
Snapshot #4 — 2026-06-09 14:22
```

### User value

Users can identify restore points by purpose, not only by date.

This is useful before:

- client review
- big layout change
- publish approval
- content migration
- risky edit
- rollback test

### Metadata storage

Snapshot names should be stored in the administered content repo, not only in browser storage.

Recommended file:

```txt
.gitcms/snapshots.json
```

Example:

```json
{
  "version": 1,
  "snapshots": {
    "gitcms-snapshot-2026-06-09T12-22-10Z": {
      "name": "Homepage approved before client review",
      "note": "",
      "updatedAt": "2026-06-09T12:30:00Z"
    }
  }
}
```

### UI changes

Each snapshot card should show:

```txt
[Snapshot name]
Snapshot #N — date
Commit SHA
[Rename] [Download] [Rollback] [Delete]
```

For Phase 1, only `Rename`, `Rollback`, and `Delete` are required.

### Rename behavior

Clicking `Rename` opens a small modal:

```txt
Snapshot name:
[ Homepage approved before client review ]

[Cancel] [Save name]
```

Saving should:

1. Load `.gitcms/snapshots.json`.
2. Update or create the metadata entry for the snapshot tag.
3. Commit the metadata file to the configured work branch.
4. Refresh the history modal.
5. Keep the original snapshot Git tag unchanged.

### Validation rules

Snapshot names should be:

- trimmed
- plain text only
- maximum 80 characters
- empty name allowed only as “clear custom name”
- no HTML rendering
- duplicate names allowed, because the Git tag remains the real identifier

### Acceptance criteria

- Snapshot cards display a custom name when one exists.
- Snapshot cards fall back to number/date when no name exists.
- Rename does not rename the Git tag.
- Delete still deletes the correct snapshot tag.
- Rollback still targets the correct snapshot tag.
- Snapshot names survive browser refresh.
- Snapshot names survive opening the admin on another machine.

### Tests

Add tests for:

- loading missing `.gitcms/snapshots.json`
- loading valid metadata
- ignoring corrupt metadata safely
- rendering custom snapshot names
- renaming a snapshot
- clearing a snapshot name
- rollback still using the original tag
- delete still using the original tag

---

## Phase 2 — Downloadable Snapshot Backups

### Version target

```txt
v1.1.90-downloadable-snapshots
```

### Goal

Allow users to download a selected snapshot as a portable backup zip.

The backup should be understandable and restorable later.

### User value

Users can keep an offline backup before risky operations.

Useful for:

- client delivery
- archiving approved states
- moving content between repos
- disaster recovery
- manual backup before large changes

### Backup file format

Downloaded file:

```txt
gitcms-snapshot-homepage-approved-before-client-review.zip
```

If no custom name exists:

```txt
gitcms-snapshot-2026-06-09T12-22-10Z.zip
```

### Zip contents

```txt
snapshot.json
files/
  fragments.json
  docs/index.html
  docs/about.html
  docs/contact.html
  docs/assets/media/...
```

### snapshot.json

Example:

```json
{
  "format": "gitcms-snapshot-backup-v1",
  "name": "Homepage approved before client review",
  "tag": "gitcms-snapshot-2026-06-09T12-22-10Z",
  "commitSha": "abc123...",
  "createdAt": "2026-06-09T12:22:10Z",
  "repo": "spaceface42/_blackhole",
  "workBranch": "content",
  "defaultBranch": "main",
  "manifestPath": "fragments.json",
  "files": [
    "fragments.json",
    "docs/index.html",
    "docs/about.html",
    "docs/contact.html"
  ]
}
```

### Export behavior

Clicking `Download` should:

1. Resolve the selected snapshot tag to a commit SHA.
2. Load the manifest at that commit.
3. Collect the manifest file.
4. Collect all HTML files referenced by the manifest.
5. Collect media files referenced by manifest/content if available.
6. Create a zip using JSZip.
7. Download it in the browser.

### Important rule

The downloaded backup should represent the selected snapshot commit, not the current branch state.

### Acceptance criteria

- Download button appears on each snapshot card.
- Backup zip contains `snapshot.json`.
- Backup zip contains `fragments.json`.
- Backup zip contains all files referenced by the manifest.
- Backup filename uses custom snapshot name when available.
- Backup export works without changing `content` or `main`.
- Export failure shows a useful error.

### Tests

Add tests for:

- backup metadata creation
- safe filename generation
- manifest file collection
- referenced HTML file collection
- missing file handling
- zip structure
- no branch mutation during download

---

## Phase 3 — Upload / Import Snapshot Backup

### Version target

```txt
v1.1.91-upload-snapshot-backup
```

### Goal

Allow users to upload a previously downloaded snapshot backup and import it safely.

### User value

Users can restore from offline backups or move a snapshot between environments.

### Restore modes

Phase 3 should start with safe import only.

### Mode A — Import as new snapshot

Recommended first implementation.

Behavior:

1. User uploads backup zip.
2. Admin validates `snapshot.json`.
3. Admin previews backup contents.
4. User confirms import.
5. Admin writes backup files to the configured work branch.
6. Admin creates a new snapshot tag.
7. Admin does not publish to `main` automatically.

This is safe because the user can review before publishing.

### Mode B — Restore directly

Optional later feature.

Behavior:

1. Upload backup zip.
2. Validate contents.
3. Replace `content`.
4. Optionally replace `main`.

This mode should require a strong confirmation because it can overwrite current work.

Suggested confirmation text:

```txt
RESTORE BACKUP
```

### Upload validation

The admin should reject backups when:

- `snapshot.json` is missing
- backup format is unknown
- file paths contain `../`
- file paths are absolute
- required files are missing
- manifest path does not match config unless user confirms
- repo metadata does not match current repo unless user confirms

### Preview UI

Before import, show:

```txt
Backup name:
Homepage approved before client review

Original repo:
spaceface42/_blackhole

Original commit:
abc123...

Files:
fragments.json
docs/index.html
docs/about.html
docs/contact.html

[Cancel] [Import as new snapshot]
```

### Acceptance criteria

- User can select a backup zip.
- Invalid backups are rejected safely.
- Valid backups show a preview.
- Import writes to `content`, not directly to `main`.
- Import creates a new snapshot tag.
- Imported backup can be rolled back like any other snapshot.
- Existing snapshots are not deleted.

### Tests

Add tests for:

- valid backup parsing
- invalid backup rejection
- path traversal rejection
- preview metadata rendering
- import-as-new-snapshot flow
- no direct publish during import
- snapshot tag creation after import

---

## Phase 4 — Snapshot Notes and Better History UI

### Version target

```txt
v1.1.92-snapshot-notes-ui
```

### Goal

Improve the snapshot history modal for real production use.

### Features

- optional snapshot note
- search/filter snapshots
- sort newest/oldest
- copy snapshot tag
- copy commit SHA
- show whether snapshot has a custom name
- show backup availability status
- warning badge for missing/corrupt metadata

### Example card

```txt
Homepage approved before client review
Snapshot #4 — 2026-06-09 14:22

Note:
Client approved the homepage layout before adding the contact form.

Commit:
abc123...

[Rename] [Edit note] [Download] [Rollback] [Delete]
```

### Acceptance criteria

- Snapshot list remains usable with many snapshots.
- Search finds snapshot names, notes, dates, tags, and SHAs.
- Missing metadata does not break history.
- Snapshot technical identity is always visible somewhere.

---

## Recommended implementation order

1. Named snapshots
2. Downloadable snapshot backups
3. Upload/import backup
4. Notes and improved history UI

Do not implement upload/restore before download exists.

Do not implement direct restore before safe import exists.

Do not rename Git tags.

---

## Technical principles

### Keep Git as the source of truth

Snapshots are Git tags.

Metadata is only extra display information.

Rollback and delete must always use the real tag.

### Keep recovery safe

Download must not mutate branches.

Upload should first import to `content`, not publish directly to `main`.

### Keep metadata portable

Snapshot names and notes should live in the content repo:

```txt
.gitcms/snapshots.json
```

This keeps names available across browsers and machines.

### Keep backup format versioned

Use:

```txt
gitcms-snapshot-backup-v1
```

This allows future format changes without breaking old backups.

### Keep the UI clear

Users should see:

- friendly snapshot name
- snapshot number
- date
- commit SHA
- rollback/delete/download actions

The friendly name helps humans.

The tag and SHA keep the system precise.
