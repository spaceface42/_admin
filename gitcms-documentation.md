# GitCMS Documentation

A simple one-person, zero-backend CMS that edits static HTML fragments through the GitHub API.

This version uses a dedicated **content branch** as the CMS working branch. The live GitHub Pages site is published from the default branch, usually `main`.

---

## 1. Concept

GitCMS is a single HTML admin file.

It lets you:

- connect to a GitHub repository with a Personal Access Token
- load editable HTML fragments from static pages
- edit fragment inner HTML
- upload and select media files
- save changes to the `content` branch
- publish `content` to `main`

The intended workflow is:

```txt
Admin reads/writes content branch
Publish merges content → main
GitHub Pages serves main
```

---

## 2. Branch model

### Default branch

Usually:

```txt
main
```

This is the live branch used by GitHub Pages.

### CMS work branch

```txt
content
```

This branch is the CMS editing source of truth.

The admin should normally read from and write to:

```txt
content
```

The `main` branch is only used as:

- the initial seed when creating `content`
- the publish target
- a fallback if something is missing from `content`

---

## 3. Creating the content branch

If you previously used a `draft` branch, duplicate it into `content`:

```bash
git fetch origin
git checkout -b content origin/draft
git push -u origin content
```

If `content` already exists and you want it to match `draft` exactly:

```bash
git fetch origin
git checkout content
git reset --hard origin/draft
git push --force-with-lease origin content
```

If starting fresh from `main`:

```bash
git fetch origin
git checkout -b content origin/main
git push -u origin content
```

---

## 4. Required files

Recommended repository structure:

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

If GitHub Pages publishes from `docs/`, then uploaded media should go into:

```txt
docs/assets/media
```

The inserted public path should usually be:

```txt
assets/media/
```

Do **not** use `/assets/media/` for normal GitHub Pages project sites, because the leading slash points to the domain root.

---

## 5. gitcms.config.json

Example config:

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

### `workBranch`

The branch used by the CMS for editing.

Recommended:

```txt
content
```

### `media.dir`

The repository path where images are uploaded.

For a `docs/` GitHub Pages site:

```txt
docs/assets/media
```

### `media.publicPrefix`

The path inserted into HTML image tags.

For top-level pages inside `docs/`, use:

```txt
assets/media/
```

This creates image tags like:

```html
<img src="assets/media/photo.jpg" alt="photo">
```

### `manifestPath`

Path to the fragment manifest.

Recommended:

```txt
fragments.json
```

---

## 6. fragments.json

This file tells GitCMS which fragments are editable.

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
  },
  {
    "id": "contact",
    "file": "docs/contact.html",
    "label": "Contact Form"
  }
]
```

Each entry needs:

| Field | Meaning |
|---|---|
| `id` | The HTML element ID |
| `file` | The file containing the fragment |
| `label` | Friendly label shown in the admin sidebar |

---

## 7. HTML fragment format

Editable fragments should be `<section>` elements with:

- an `id`
- the class `fragment`

Example:

```html
<section id="hero" class="fragment hero">
  <h1>Hello world</h1>
  <p>This content can be edited in GitCMS.</p>
</section>
```

The CMS edits the **inner HTML** of the section.

The outer section tag is preserved, including attributes like:

```html
data-theme="dark"
aria-label="Hero"
```

---

## 8. Installing the admin file

1. Put the admin HTML file in the repo.
2. Open it in the browser.
3. Enter the GitHub repository URL.
4. Enter a GitHub Personal Access Token.
5. Click **Connect**.

Repository URL example:

```txt
https://github.com/username/repository-name
```

---

## 9. GitHub token requirements

Use a fine-grained Personal Access Token.

Recommended permissions:

```txt
Repository: selected target repo only
Contents: Read and write
```

Avoid using a classic `repo` token unless necessary.

The current development version stores the token in browser `localStorage`.

Important:

```txt
Base64 is not encryption.
```

For private/personal development this is acceptable, but for broader use consider:

- `sessionStorage`
- no persistence
- GitHub OAuth/device flow

---

## 10. Editing content

Normal editing flow:

1. Connect to the repository.
2. Select a fragment from the sidebar.
3. Edit the HTML in the editor.
4. Click **Save → Content** or equivalent save button.
5. Enter a commit message.
6. Commit to the `content` branch.
7. Publish when ready.

Until publishing, the live site does not change.

---

## 11. Media library

The media library allows you to:

- upload images
- browse thumbnails
- click an image to insert an `<img>` tag into the editor

Default media config:

```json
{
  "dir": "docs/assets/media",
  "publicPrefix": "assets/media/"
}
```

When you upload:

```txt
photo.jpg
```

it is saved to:

```txt
docs/assets/media/photo.jpg
```

The editor inserts:

```html
<img src="assets/media/photo.jpg" alt="photo">
```

---

## 12. Media thumbnail cache behavior

GitHub raw file URLs and GitHub Pages can have short propagation or cache delays.

The admin handles this by:

- showing a local thumbnail immediately after upload
- keeping the local thumbnail while GitHub catches up
- refreshing media silently in the background
- cache-busting remote thumbnails
- retrying failed thumbnail loads

This prevents the common issue:

```txt
thumbnail appears → vanishes → appears again
```

---

## 13. Publishing

Publishing means:

```txt
content → main
```

The live GitHub Pages site updates after GitHub Pages rebuilds or redeploys.

Typical publish flow:

1. Save all fragment changes to `content`.
2. Click **Publish**.
3. CMS syncs/merges as needed.
4. `main` receives the content changes.
5. GitHub Pages updates the live site.

---

## 14. GitHub Pages path rules

For a GitHub Pages project site like:

```txt
https://username.github.io/repository-name/
```

do **not** use:

```txt
/assets/media/
```

because it points to:

```txt
https://username.github.io/assets/media/
```

Instead use:

```txt
assets/media/
```

which resolves to:

```txt
https://username.github.io/repository-name/assets/media/
```

Correct config:

```json
{
  "media": {
    "dir": "docs/assets/media",
    "publicPrefix": "assets/media/"
  }
}
```

---

## 15. Troubleshooting

### Image uploads, but live site cannot find it

Check:

1. The image was published from `content` to `main`.
2. The file exists in `main` under:

```txt
docs/assets/media/
```

3. The image tag uses:

```txt
assets/media/image-name.jpg
```

not:

```txt
/assets/media/image-name.jpg
```

---

### Thumbnail appears, disappears, then reappears

This is usually GitHub raw/CDN timing.

The latest admin version should reduce this with:

- local temporary thumbnails
- cache-busting
- retry logic

If it still happens briefly, wait a few seconds and refresh the media modal.

---

### Fragment does not appear in sidebar

Check:

1. It exists in `fragments.json`.
2. The file path is correct.
3. The HTML element has matching `id`.
4. The element has class `fragment`.

Example:

```html
<section id="hero" class="fragment hero">
```

Manifest entry:

```json
{
  "id": "hero",
  "file": "docs/index.html",
  "label": "Hero Section"
}
```

---

### Publish conflict

A conflict means `main` and `content` changed in incompatible ways.

For a one-person CMS, simplest fixes are:

- inspect GitHub compare view
- manually resolve the conflict
- or reset `content` from `main` if you do not need unpublished changes

---

### Token fails

Check:

- token is not expired
- token has access to the correct repository
- token has `Contents: Read and write`
- repository URL is correct

---

## 16. Recommended workflow

Use this simple process:

```txt
1. Edit content in GitCMS
2. Save to content branch
3. Upload/select media as needed
4. Preview in admin
5. Publish content → main
6. Check live GitHub Pages site
```

---

## 17. Recommended safety rules

- Use unique image filenames when replacing images.
- Avoid repeatedly uploading different files with the same name.
- Keep `content` as the only CMS editing branch.
- Do not edit the same file from GitHub web UI while GitCMS is open.
- Keep the GitHub token limited to the target repo only.
- Commit/publish often enough to avoid large unpublished changes.

---

## 18. Quick reference

### Duplicate old draft branch to content

```bash
git fetch origin
git checkout -b content origin/draft
git push -u origin content
```

### Fresh content branch from main

```bash
git fetch origin
git checkout -b content origin/main
git push -u origin content
```

### Recommended config

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

### Recommended fragment

```html
<section id="hero" class="fragment hero">
  <h1>Editable hero title</h1>
  <p>Editable hero body.</p>
</section>
```

---

## 19. Current intended architecture

```txt
GitCMS admin
    ↓ reads/writes
content branch
    ↓ publish
main branch
    ↓ GitHub Pages
live website
```

This keeps editing separate from the live site while making the CMS behavior easy to understand.
