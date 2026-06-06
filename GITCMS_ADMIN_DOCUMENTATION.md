# GitCMS Admin Documentation

Version: v1 release-candidate documentation  
Purpose: one-person, Git-backed CMS for static HTML sites hosted on GitHub Pages.

---

## 1. What GitCMS Is

GitCMS is a single-file, zero-backend admin interface for editing static HTML fragments in a GitHub repository.

It is designed for this workflow:

```txt
GitCMS admin
    ↓ reads/writes
content branch
    ↓ publish
main branch
    ↓ GitHub Pages
live website
```

The CMS does not use:

- a database
- a backend server
- user accounts
- roles
- a page-builder runtime

The repository remains the source of truth.

---

## 2. Intended Use Case

GitCMS is best for:

- one-person static sites
- small HTML sites
- GitHub Pages sites
- editable landing pages
- documentation-style static pages
- sites where HTML should stay plain and inspectable

GitCMS is not intended for:

- multi-user editorial workflows
- complex permissions
- large media libraries
- visual drag-and-drop site building
- dynamic app content
- private client use without improving token handling

---

## 3. Repository Model

Recommended repository structure:

```txt
repo/
├─ admin.html
├─ gitcms.config.json
├─ fragments.json
└─ docs/
   ├─ index.html
   ├─ about.html
   ├─ contact.html
   └─ assets/
      ├─ style.css
      └─ media/
```

Recommended GitHub Pages setup:

```txt
Source branch: main
Publish folder: docs/
```

Recommended CMS branch:

```txt
content
```

---

## 4. Branch Model

### `main`

The live branch.

GitHub Pages publishes from this branch.

### `content`

The CMS editing branch.

GitCMS reads from and writes to this branch.

### Publish

Publishing means:

```txt
content → main
```

The live site updates after GitHub Pages finishes deployment.

---

## 5. Creating the Content Branch

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

### Reset local content branch to remote content

This discards local changes:

```bash
git fetch origin
git checkout content
git reset --hard origin/content
git clean -fd
```

Stronger version, also removes ignored files:

```bash
git fetch origin
git checkout content
git reset --hard origin/content
git clean -fdx
```

---

## 6. Required Config File

File:

```txt
gitcms.config.json
```

Recommended full config:

```json
{
  "workBranch": "content",
  "media": {
    "dir": "docs/assets/media",
    "publicPrefix": "assets/media/"
  },
  "preview": {
    "css": [
      "assets/style.css"
    ]
  },
  "manifestPath": "fragments.json"
}
```

---

## 7. Config Fields

### `workBranch`

Branch GitCMS edits.

Recommended:

```json
"workBranch": "content"
```

### `media.dir`

Repository path where uploaded images are stored.

For a GitHub Pages site published from `docs/`:

```json
"dir": "docs/assets/media"
```

### `media.publicPrefix`

Path inserted into HTML image tags.

For normal GitHub Pages project sites, use:

```json
"publicPrefix": "assets/media/"
```

Do not use this for project sites:

```json
"publicPrefix": "/assets/media/"
```

Because `/assets/media/` points to the domain root:

```txt
https://username.github.io/assets/media/
```

instead of the project site:

```txt
https://username.github.io/repo-name/assets/media/
```

### `preview.css`

CSS files loaded into the preview iframe.

Use public paths:

```json
"css": [
  "assets/style.css"
]
```

GitCMS internally resolves this to the repo file:

```txt
docs/assets/style.css
```

### `manifestPath`

Path to the fragment manifest.

Recommended:

```json
"manifestPath": "fragments.json"
```

---

## 8. Fragment Manifest

File:

```txt
fragments.json
```

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
    "id": "features",
    "file": "docs/index.html",
    "label": "Features"
  },
  {
    "id": "cta",
    "file": "docs/index.html",
    "label": "Call to Action"
  },
  {
    "id": "team",
    "file": "docs/about.html",
    "label": "Team"
  },
  {
    "id": "mission",
    "file": "docs/about.html",
    "label": "Mission Statement"
  },
  {
    "id": "map",
    "file": "docs/contact.html",
    "label": "Location Map"
  },
  {
    "id": "contact",
    "file": "docs/contact.html",
    "label": "Contact Form"
  }
]
```

Each entry requires:

| Field | Meaning |
|---|---|
| `id` | Fragment identifier |
| `file` | Repo-relative HTML file path |
| `label` | Sidebar label shown in GitCMS |

---

## 9. Preferred HTML Fragment Format

Use combined marker comments and data attributes.

```html
<!-- cms:start hero -->
<section data-fragment="hero" data-label="Hero Section" id="hero" class="fragment hero">
  <h1>Hello world</h1>
  <p>This content is editable in GitCMS.</p>
</section>
<!-- cms:end hero -->
```

### Why both comments and data attributes?

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

This is more robust than only parsing `<section>` tags.

---

## 10. Backward-Compatible Fragment Formats

GitCMS can still read older formats.

### Old class-based format

```html
<section id="hero" class="fragment">
  ...
</section>
```

### Data-only format

```html
<section data-fragment="hero" data-label="Hero Section">
  ...
</section>
```

But the recommended format is the full marker format.

---

## 11. Editing Model

GitCMS edits only the **inner HTML** of the marked element.

Given:

```html
<!-- cms:start hero -->
<section data-fragment="hero" data-label="Hero Section" id="hero" class="fragment hero">
  <h1>Hello</h1>
</section>
<!-- cms:end hero -->
```

The editor shows:

```html
<h1>Hello</h1>
```

The outer element and marker comments are preserved.

---

## 12. Login and GitHub Token

GitCMS requires:

- repository URL
- GitHub Personal Access Token

Use a fine-grained PAT scoped only to the target repo.

Required permission:

```txt
Contents: Read and write
```

The current admin stores the token in `localStorage`.

This is acceptable for personal development, but not ideal for public or multi-user usage.

Future security options:

- `sessionStorage`
- do not store token
- OAuth/device flow

---

## 13. Main Admin UI

The admin UI contains:

- topbar
- fragment sidebar
- HTML editor
- live preview pane
- settings modal
- diagnostics modal
- media library modal
- commit modal
- publish modal

---

## 14. Topbar Buttons

### GitHub Content

Opens:

```txt
https://github.com/OWNER/REPO/tree/content
```

### Live Site

Opens the GitHub Pages URL.

The admin tries the GitHub Pages API first and falls back to:

```txt
https://OWNER.github.io/REPO/
```

### Settings

Opens config editing UI.

### Diagnostics

Shows current runtime/config state and validation warnings.

### Media

Opens the media library.

### Publish

Publishes:

```txt
content → main
```

---

## 15. Settings Modal

The Settings modal edits:

- manifest path
- media repo folder
- media public prefix
- preview CSS paths

Example values:

```txt
Manifest path: fragments.json
Media folder: docs/assets/media
Media URL prefix: assets/media/
Preview CSS: assets/style.css
```

Settings are saved to:

```txt
gitcms.config.json
```

on the `content` branch.

---

## 16. Diagnostics Modal

Diagnostics shows:

- repository
- default branch
- content branch
- manifest path
- manifest loaded status
- config loaded status
- validation warning count
- media folder
- media URL prefix
- preview CSS
- preview mode
- fragments loaded
- files loaded
- unsaved fragments
- active fragment
- active file
- repository URL
- content branch URL
- live site URL
- admin origin

It also shows validation warnings.

Use Diagnostics first when something seems wrong.

---

## 17. Validation

GitCMS validates config, manifest, and markers.

### Config validation

Checks:

- missing `workBranch`
- missing `manifestPath`
- missing `media.dir`
- missing `media.publicPrefix`
- risky `/assets/media/` prefix on project sites
- invalid `preview.css`
- invalid JSON

### Manifest validation

Checks:

- invalid JSON
- manifest not being an array
- duplicate fragment IDs
- missing `id`
- missing `file`
- missing `label`
- absolute file paths
- manifest fragments not found in loaded HTML

### Marker validation

Checks:

- `cms:start` without matching `cms:end`
- duplicate marker IDs
- marker ID mismatch with `data-fragment`
- missing `data-fragment`
- missing `data-label`
- marker block with no valid element
- unclosed marker element

Example correct marker:

```html
<!-- cms:start hero -->
<section data-fragment="hero" data-label="Hero Section" id="hero" class="fragment">
  ...
</section>
<!-- cms:end hero -->
```

---

## 18. Common Marker Mistakes

### Missing end marker

Wrong:

```html
<!-- cms:start hero -->
<section data-fragment="hero">
  ...
</section>
```

Correct:

```html
<!-- cms:start hero -->
<section data-fragment="hero" data-label="Hero Section">
  ...
</section>
<!-- cms:end hero -->
```

### End marker without start marker

Wrong:

```html
<section id="intro" class="fragment">
  ...
</section>
<!-- cms:end intro -->
```

Correct:

```html
<!-- cms:start intro -->
<section data-fragment="intro" data-label="Introduction" id="intro" class="fragment">
  ...
</section>
<!-- cms:end intro -->
```

### Mismatched names

Wrong:

```html
<!-- cms:start hero -->
<section data-fragment="intro">
  ...
</section>
<!-- cms:end hero -->
```

Correct:

```html
<!-- cms:start hero -->
<section data-fragment="hero">
  ...
</section>
<!-- cms:end hero -->
```

---

## 19. Media Library

The media library supports:

- image upload
- thumbnail browsing
- image insert
- alt-text dialog
- decorative image option
- media delete
- collision-safe uploads
- thumbnail retry/cache-busting

---

## 20. Uploading Media

With this config:

```json
{
  "media": {
    "dir": "docs/assets/media",
    "publicPrefix": "assets/media/"
  }
}
```

Uploading:

```txt
photo.jpg
```

saves the image to:

```txt
docs/assets/media/photo.jpg
```

And inserts:

```html
<img src="assets/media/photo.jpg" alt="Photo description">
```

---

## 21. Media Collision Protection

GitCMS checks whether the target upload path already exists.

If the target exists:

```txt
docs/assets/media/photo.jpg
```

GitCMS automatically renames the new upload:

```txt
docs/assets/media/photo-2.jpg
```

The UI shows a warning when this happens.

---

## 22. Alt Text Dialog

When inserting an image, GitCMS asks for alt text.

Meaningful image:

```html
<img src="assets/media/team.jpg" alt="Three team members working at a table">
```

Decorative image:

```html
<img src="assets/media/pattern.svg" alt="">
```

The decorative checkbox intentionally inserts empty alt text.

---

## 23. Deleting Media

Media delete removes the file from the `content` branch.

The live site changes only after publishing:

```txt
content → main
```

Before deletion, GitCMS checks whether loaded fragments appear to reference the image.

If usage is found, the delete modal warns you.

---

## 24. Preview Modes

The preview pane supports:

```txt
Fragment | Page
```

### Fragment Preview

Shows only the selected fragment.

Useful for quick content checks.

### Page Preview

Loads the full HTML page, injects the current unsaved fragment, rewrites local asset URLs, and shows the fragment in page context.

Useful for:

- page width
- typography
- spacing
- navigation/footer context
- image layout

Scripts are disabled for safety.

The iframe remains sandboxed.

---

## 25. Preview CSS

Preview CSS is controlled by:

```json
"preview": {
  "css": [
    "assets/style.css"
  ]
}
```

Use public paths, not repo paths.

Correct:

```txt
assets/style.css
```

Avoid:

```txt
docs/assets/style.css
```

The admin maps the public path to the repo path internally.

---

## 26. Saving Content

Click:

```txt
Save → Content
```

This commits changes to the `content` branch.

If multiple dirty fragments are in the same file, GitCMS saves them together in one commit.

---

## 27. Publishing

The publish modal shows a summary of changed files between:

```txt
main...content
```

Example:

```txt
modified  docs/index.html
added     docs/assets/media/photo.jpg
deleted   docs/assets/media/old-photo.jpg
```

Publishing merges:

```txt
content → main
```

After that, GitHub Pages updates the live site.

---

## 28. Publish Conflicts

A conflict means `content` and `main` both changed in incompatible ways.

Options:

- resolve in GitHub compare view
- manually edit branches
- reset `content` from `main` if unpublished changes can be discarded

For a one-person CMS, conflicts should be rare.

---

## 29. Recommended Daily Workflow

```txt
1. Open admin.html
2. Connect to repo
3. Edit fragment
4. Insert/upload media if needed
5. Add good alt text
6. Save to content
7. Open Publish
8. Review changed files
9. Publish content → main
10. Check live site
```

---

## 30. Troubleshooting

### Admin stuck on Loading

Check:

- token is valid
- repo URL is correct
- `content` branch exists
- `fragments.json` is valid JSON
- markers are valid
- browser console

### CSS not visible in preview

Check config:

```json
"preview": {
  "css": [
    "assets/style.css"
  ]
}
```

Do not use:

```json
"css": [
  "docs/assets/style.css"
]
```

### Image works in admin but not live site

Check:

- image was published from `content` to `main`
- image exists under `docs/assets/media` on `main`
- HTML uses `assets/media/...`, not `/assets/media/...`

### Fragment missing

Check:

- manifest entry exists
- file path is correct
- `cms:start` and `cms:end` are present
- `data-fragment` matches the manifest ID

### Validation warning: missing `workBranch`

Add:

```json
"workBranch": "content"
```

### Validation warning: missing `cms:end hero`

Add:

```html
<!-- cms:end hero -->
```

after the hero section.

---

## 31. Recommended Final Files

For a v1 project, keep:

```txt
admin.html
gitcms.config.json
fragments.json
docs/index.html
docs/about.html
docs/contact.html
docs/assets/style.css
docs/assets/media/
README.md
```

Avoid keeping many old admin test files in the live repo.

---

## 32. Current Feature Checklist

- content branch workflow
- GitHub content link
- live site link
- fragment sidebar
- HTML editor
- save to content
- publish to main
- publish summary
- diagnostics
- config validation
- manifest validation
- marker validation
- media upload
- media delete
- media collision protection
- alt text dialog
- preview CSS
- fragment preview
- page preview
- sandboxed iframe

---

## 33. Suggested Next Improvements

Possible future features:

1. Copy media URL button
2. Structured/tag editor mode
3. HTML snippet buttons
4. Better media usage viewer
5. Optional token storage setting
6. HTML formatter
7. v1.0 release package

Keep the core simple.
