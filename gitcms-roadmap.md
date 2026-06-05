# GitCMS Roadmap

A practical roadmap for evolving GitCMS while keeping its core strength: a simple one-person, Git-backed CMS for static sites.

---

## Product Direction

GitCMS should remain:

```txt
single admin
single repo
content branch as CMS source
main branch as live site
no backend
no database
GitHub API only
```

The goal is not to become WordPress, Netlify CMS, or a full visual site builder.

The goal is:

```txt
a lightweight personal CMS for editing static HTML fragments safely and quickly
```

---

## Current Architecture

```txt
GitCMS admin
    ↓ reads/writes
content branch
    ↓ publish
main branch
    ↓ GitHub Pages
live website
```

Current strengths:

- simple one-file admin
- GitHub remains source of truth
- no server required
- media upload works
- media thumbnails are cache-protected
- publish flow is understandable
- good fit for one-person static sites

Current risks:

- HTML fragment parsing is still the weakest technical area
- GitHub PAT is stored in browser storage
- no full undo/history UI inside admin
- media handling is basic
- not intended for multiple admins

---

# Phase 1 — Stabilize Current CMS

**Priority:** High  
**Goal:** Make the current version boring, predictable, and safe for personal use.

## 1.1 Finalize `content` branch workflow

Status: mostly done.

Keep this model:

```txt
admin reads content
admin writes content
publish merges content → main
GitHub Pages serves main
```

Tasks:

- keep `workBranch: "content"` in `gitcms.config.json`
- remove remaining old `draft` wording in UI/comments if any remain
- make all publish messages say `content → main`
- make reset buttons say `Reset content from main`

Acceptance criteria:

- user never sees confusing `draft` wording
- admin behavior matches the word `content`
- docs, config, UI, and code all agree

---

## 1.2 Improve error messages

Status: partially done.

Tasks:

- show clearer GitHub API errors
- distinguish:
  - bad token
  - missing repo access
  - branch missing
  - file missing
  - merge conflict
  - GitHub Pages delay
- include recommended action in each error

Example:

```txt
Image uploaded to content, but it is not live yet.
Publish content → main, then wait for GitHub Pages to update.
```

Acceptance criteria:

- errors explain what happened
- errors explain what to do next

---

## 1.3 Add basic diagnostics panel

Status: not started.

Add a small **Diagnostics** or **Status** modal showing:

```txt
repo
default branch
work branch
manifest path
media folder
media public prefix
fragments loaded
last load source
token permission check result
```

Acceptance criteria:

- user can quickly verify setup
- path mistakes become obvious

---

# Phase 2 — Replace Fragile Fragment Parsing

**Priority:** Highest technical priority  
**Goal:** Replace fragile section parsing with explicit CMS markers.

This is the most important long-term code quality improvement.

## 2.1 Introduce marker-based fragments

Current style:

```html
<section id="hero" class="fragment hero">
  ...
</section>
```

Recommended future style:

```html
<!-- cms:start hero -->
<section id="hero" class="fragment hero">
  ...
</section>
<!-- cms:end hero -->
```

Benefits:

- safer parsing
- supports nested `<section>` elements
- less risk of editing the wrong block
- easier error messages
- easier future support for non-section fragments

---

## 2.2 Support both old and new formats temporarily

Migration should be gentle.

Parser order:

```txt
1. use cms markers if present
2. fallback to current <section class="fragment"> parser
```

Acceptance criteria:

- old pages still work
- new marker-based pages work better
- no forced migration on day one

---

## 2.3 Add migration helper

Add a button or script:

```txt
Convert fragments to marker format
```

It should wrap each known manifest fragment like:

```html
<!-- cms:start hero -->
<section id="hero" class="fragment hero">
  ...
</section>
<!-- cms:end hero -->
```

Acceptance criteria:

- existing sites can migrate safely
- user can inspect changes before publishing

---

# Phase 3 — Media Library Improvements

**Priority:** Medium  
**Goal:** Make media handling more pleasant without becoming a full DAM system.

## 3.1 Keep current simple media model

Current model is good:

```txt
upload to docs/assets/media
insert assets/media/file.jpg
```

Do not add complex folder management yet.

---

## 3.2 Add image replacement protection

Problem:

Uploading a new image with the same filename can cause cache weirdness.

Tasks:

- warn before overwriting existing filename
- suggest unique filename
- optionally auto-add timestamp

Example:

```txt
hero.jpg → hero-20260605-1430.jpg
```

Acceptance criteria:

- accidental overwrites are harder
- live-site cache issues are reduced

---

## 3.3 Add copy URL button

Each media card should have:

```txt
Copy URL
Insert image
```

Acceptance criteria:

- user can copy `assets/media/photo.jpg`
- user can insert full `<img>` tag

---

## 3.4 Add delete media

Optional, not urgent.

Tasks:

- add delete button
- require confirmation
- delete from `content` branch only
- warn that published images remain live until publish

Acceptance criteria:

- user can clean unused media
- deletion is explicit and safe

---

## 3.5 Optional image optimization

Later enhancement.

Possible options:

- resize before upload
- convert to WebP
- strip huge filenames
- show image dimensions and file size

Avoid this until core CMS is stable.

---

# Phase 4 — Preview Improvements

**Priority:** Medium  
**Goal:** Make the preview closer to the live site while preserving iframe safety.

## 4.1 Configurable preview CSS

Add to config:

```json
{
  "preview": {
    "css": [
      "assets/css/style.css"
    ]
  }
}
```

Preview iframe can load safe CSS files.

Acceptance criteria:

- preview looks closer to live site
- scripts remain blocked
- iframe sandbox remains enabled

---

## 4.2 Preview full page context

Current preview shows one fragment.

Possible future option:

```txt
Preview in page
```

This would load the full HTML page from `content` and replace the selected fragment with current edits.

Acceptance criteria:

- user can see fragment inside actual page layout
- still no unsafe script execution

---

# Phase 5 — Safer Auth

**Priority:** Medium for personal use, high for wider use  
**Goal:** Reduce risk from browser-stored GitHub tokens.

## 5.1 Improve token storage option

Current:

```txt
localStorage
```

Add setting:

```txt
Remember token: yes/no
```

Options:

```txt
localStorage  → remembers after browser restart
sessionStorage → clears when tab/session closes
none → paste token every time
```

Acceptance criteria:

- user can choose convenience or safety
- current behavior remains available

---

## 5.2 Token permission check

After connecting, test:

```txt
can read repo
can read content branch
can write test? no destructive write
```

At minimum, show permission-related failures clearly.

---

## 5.3 OAuth/device flow

Only if this CMS becomes more than personal.

This likely requires more setup and may compromise the zero-backend simplicity.

Do not prioritize now.

---

# Phase 6 — Better Publishing Controls

**Priority:** Medium  
**Goal:** Make publish safer and more transparent.

## 6.1 Show unpublished changes

Before publishing, show:

```txt
Files changed on content branch compared to main
```

Example:

```txt
docs/index.html
docs/assets/media/photo.jpg
fragments.json
gitcms.config.json
```

Acceptance criteria:

- user knows what will publish
- fewer surprises

---

## 6.2 Add publish confirmation summary

Before merge:

```txt
You are publishing content → main.
Changed files:
- docs/index.html
- docs/assets/media/photo.jpg
```

Acceptance criteria:

- publishing feels deliberate
- accidental publishes are less likely

---

## 6.3 Optional rollback helper

Simple rollback option:

```txt
revert last publish commit
```

This is optional and should be added only after publish flow is very stable.

---

# Phase 7 — Editing UX

**Priority:** Low to medium  
**Goal:** Make editing nicer without building a full WYSIWYG system.

## 7.1 Add quick insert buttons

Examples:

```txt
Heading
Paragraph
Button link
Image
Two-column block
```

These insert HTML snippets into the textarea.

Acceptance criteria:

- faster editing
- still plain HTML underneath

---

## 7.2 Add HTML formatting

Add button:

```txt
Format HTML
```

Use a lightweight formatter if possible.

Acceptance criteria:

- edited fragments stay readable
- no destructive formatting

---

## 7.3 Add dirty file summary

Show:

```txt
Unsaved changes:
- Hero Section
- Introduction
```

Acceptance criteria:

- easier to know what needs saving

---

# Phase 8 — Optional Advanced Features

These are useful but not needed soon.

## 8.1 Fragment types

Allow manifest entries like:

```json
{
  "id": "hero",
  "file": "docs/index.html",
  "label": "Hero",
  "type": "html"
}
```

Possible future types:

```txt
html
text
image
link
markdown
```

Do not add until marker parsing is stable.

---

## 8.2 Markdown fragments

Allow editing some fragments as Markdown and converting to HTML.

Useful for blog-like content, but not needed for the current static-page CMS.

---

## 8.3 Multiple media directories

Possible config:

```json
{
  "media": {
    "dirs": [
      {
        "label": "Images",
        "dir": "docs/assets/media",
        "publicPrefix": "assets/media/"
      },
      {
        "label": "Downloads",
        "dir": "docs/assets/downloads",
        "publicPrefix": "assets/downloads/"
      }
    ]
  }
}
```

Only add if one media folder becomes limiting.

---

# Things to Avoid

Avoid adding these too early:

- user accounts
- roles/permissions
- database
- backend server
- complex page builder
- drag-and-drop layout editor
- multi-admin locking
- large dependency stack
- full WYSIWYG editor

These would make GitCMS heavier and less reliable.

The best version of GitCMS is small, direct, and Git-native.

---

# Recommended Next 5 Tasks

## Task 1

Remove remaining `draft` wording from UI/comments.

```txt
Impact: low/medium
Difficulty: easy
Priority: high
```

## Task 2

Implement marker-based parser while keeping old section parser fallback.

```txt
Impact: high
Difficulty: medium
Priority: very high
```

## Task 3

Add Diagnostics modal.

```txt
Impact: medium
Difficulty: easy/medium
Priority: high
```

## Task 4

Add media overwrite warning and timestamp rename option.

```txt
Impact: medium
Difficulty: easy
Priority: medium
```

## Task 5

Add publish summary of changed files.

```txt
Impact: medium/high
Difficulty: medium
Priority: medium
```

---

# Roadmap Summary

| Phase | Focus | Priority |
|---|---|---|
| Phase 1 | Stabilize current CMS | High |
| Phase 2 | Marker-based parsing | Very high |
| Phase 3 | Media improvements | Medium |
| Phase 4 | Better preview | Medium |
| Phase 5 | Safer auth | Medium |
| Phase 6 | Publishing controls | Medium |
| Phase 7 | Editing UX | Low/Medium |
| Phase 8 | Advanced features | Optional |

---

# Final Direction

Keep GitCMS as:

```txt
a minimal personal CMS for static HTML sites
```

The winning formula is:

```txt
plain files
plain Git
content branch
simple admin
controlled publishing
no backend
```

Do not overbuild it.
