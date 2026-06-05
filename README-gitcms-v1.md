# GitCMS v1 Documentation

GitCMS is a small, zero-backend CMS for editing static HTML pages directly through the GitHub API.

This version is designed for a **one-person static site workflow**.

---

## 1. Core Workflow

GitCMS uses a dedicated editing branch:

```txt
content
```

The live site branch is usually:

```txt
main
```

The workflow is:

```txt
GitCMS admin
    ↓ reads/writes
content branch
    ↓ publish
main branch
    ↓ GitHub Pages
live website
```

This means:

- editing happens safely on `content`
- the live site does not change until you publish
- publishing merges `content → main`
- GitHub Pages serves the live site from `main`

---

## 2. Required Files

Recommended repo layout:

```txt
repo/
├─ admin-index.html
├─ gitcms.config.json
├─ fragments.json
└─ docs/
   ├─ index.html
   ├─ about.html
   ├─ contact.html
   └─ assets/
      └─ media/
```

If GitHub Pages publishes from `docs/`, media should be uploaded to:

```txt
docs/assets/media
```

HTML should reference media as:

```txt
assets/media/file.jpg
```

Do **not** use `/assets/media/file.jpg` for a normal GitHub Pages project site, because the leading slash points to the domain root.

---

## 3. Branch Setup

### Create `content` from `main`

```bash
git fetch origin
git checkout -b content origin/main
git push -u origin content
```

### Duplicate old `draft` branch into `content`

```bash
git fetch origin
git checkout -b content origin/draft
git push -u origin content
```

### Force existing `content` to match `draft`

Use only if you intentionally want to overwrite the current `content` branch:

```bash
git fetch origin
git checkout content
git reset --hard origin/draft
git push --force-with-lease origin content
```

---

## 4. `gitcms.config.json`

This file controls the CMS branch, media folder, media URL prefix, and manifest path.

Recommended config for GitHub Pages publishing from `docs/`:

```json
{
  "workBranch": "content",
  "media": {
    "dir": "docs/assets/media",
    "publicPrefix": "assets/media/"
  },
  "manifestPath": "fragments.json"
}
```

### Fields

| Field | Meaning |
|---|---|
| `workBranch` | Branch GitCMS edits. Recommended: `content`. |
| `media.dir` | Repository folder where images are uploaded. |
| `media.publicPrefix` | Path inserted into `<img src="">`. |
| `manifestPath` | Path to `fragments.json`. |

---

## 5. `fragments.json`

This file lists editable fragments.

Example:

```json
[
  {
    "id": "hero",
    "file": "docs/index.html",
    "label": "Hero Section"
  },
  {
    "id": "intro",
    "file": "docs/index.html",
    "label": "Introduction"
  }
]
```

### Fields

| Field | Meaning |
|---|---|
| `id` | Fragment ID. Must match `cms:start` and `data-fragment`. |
| `file` | HTML file containing the fragment. |
| `label` | Friendly name shown in the CMS sidebar. |

---

## 6. Preferred Fragment Format

Use the combined marker + data attribute format:

```html
<!-- cms:start hero -->
<section data-fragment="hero" data-label="Hero Section" id="hero" class="fragment">
  <h1>Editable heading</h1>
  <p>Editable content.</p>
</section>
<!-- cms:end hero -->
```

### Why this format?

The comments define the safe editable boundary:

```html
<!-- cms:start hero -->
...
<!-- cms:end hero -->
```

The attributes describe the fragment:

```html
data-fragment="hero"
data-label="Hero Section"
```

This is more reliable than only parsing `<section>` tags, especially if nested sections are used later.

---

## 7. Backward Compatibility

GitCMS still supports older fragments:

```html
<section id="hero" class="fragment">
  ...
</section>
```

and:

```html
<section data-fragment="hero" data-label="Hero Section">
  ...
</section>
```

But the recommended format is the full marker format.

---

## 8. Media Library

The media library supports:

- image upload
- thumbnail browsing
- insert image with alt text
- decorative image option with `alt=""`
- media delete from `content`
- thumbnail cache protection
- collision-safe upload names

### Upload location

With the recommended config, uploaded images go here:

```txt
docs/assets/media
```

### Inserted HTML

GitCMS inserts:

```html
<img src="assets/media/example.jpg" alt="Example image">
```

### Alt text dialog

When selecting an image, GitCMS asks for alt text.

For meaningful images:

```html
<img src="assets/media/team-photo.jpg" alt="Three team members working around a table">
```

For decorative images:

```html
<img src="assets/media/pattern.svg" alt="">
```

---

## 9. Media Delete

Deleting media removes it from the `content` branch only.

The live site changes only after:

```txt
Publish content → main
```

GitCMS warns if the image appears to be used in loaded fragments.

---

## 10. Media Collision Protection

GitCMS avoids overwriting existing media.

If this target already exists:

```txt
docs/assets/media/photo.jpg
```

GitCMS automatically renames the new upload:

```txt
docs/assets/media/photo-2.jpg
```

The UI shows a warning when this happens.

---

## 11. Publish Summary

Before publishing, GitCMS compares:

```txt
main...content
```

and shows changed files, such as:

```txt
modified  docs/index.html
added     docs/assets/media/photo.jpg
deleted   docs/assets/media/old-image.png
```

Publishing merges:

```txt
content → main
```

---

## 12. Diagnostics

The Diagnostics modal shows:

- repository
- default branch
- content branch
- manifest path
- config path
- media folder
- media URL prefix
- loaded fragments
- loaded files
- unsaved fragments
- active fragment
- active file
- repo URL
- live site URL

Use this first when debugging path, branch, or media issues.

---

## 13. GitHub Token

Use a fine-grained GitHub Personal Access Token.

Recommended permission:

```txt
Contents: Read and write
```

Scope it only to the target repository.

Current development behavior:

```txt
Token is stored in browser localStorage.
```

This is convenient for personal use, but not ideal for multi-user or public deployments.

---

## 14. Troubleshooting

### Admin is stuck on Loading

Likely causes:

- bad token
- wrong repo URL
- manifest points to missing files
- malformed HTML markers
- branch does not exist

Check Diagnostics and browser console.

---

### Image appears in admin but not live site

Likely causes:

- image exists on `content` but has not been published to `main`
- GitHub Pages has not finished updating
- image path starts with `/assets/media/` instead of `assets/media/`

Use:

```txt
assets/media/file.jpg
```

for normal GitHub Pages project sites.

---

### Fragment does not appear

Check all three values match:

`fragments.json`:

```json
{
  "id": "hero",
  "file": "docs/index.html",
  "label": "Hero Section"
}
```

HTML:

```html
<!-- cms:start hero -->
<section data-fragment="hero" data-label="Hero Section" id="hero" class="fragment">
```

The ID must match:

```txt
hero
```

---

### Publish conflict

A conflict means `content` and `main` both changed in incompatible ways.

Options:

- open GitHub compare view
- resolve manually
- reset `content` from `main` if unpublished changes are disposable

---

## 15. Recommended v1 Workflow

```txt
1. Open GitCMS admin.
2. Connect to the GitHub repo.
3. Edit fragments.
4. Upload/select media.
5. Insert images with alt text.
6. Save changes to content.
7. Check Publish summary.
8. Publish content → main.
9. Check the live site.
```

---

## 16. Release Candidate Feature List

Current v1 release candidate includes:

- `content` branch editing model
- GitHub repo and live-site buttons
- media upload
- media thumbnail retry/cache-busting
- media collision-safe upload
- media delete modal
- alt text insert dialog
- diagnostics modal
- publish summary
- safe marker parser
- backward compatibility with old fragments
