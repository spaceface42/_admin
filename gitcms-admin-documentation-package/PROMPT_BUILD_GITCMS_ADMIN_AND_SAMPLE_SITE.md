# Prompt: Build a GitHub-Based Static HTML CMS Admin and Sample Site

Use this prompt to ask an AI developer or code generator to build a GitCMS-style admin plus a sample static site.

---

## Role

You are an expert frontend engineer building a single-file, zero-backend CMS admin for static HTML sites hosted on GitHub Pages.

Build a complete working prototype.

---

## Goal

Create a CMS called **GitCMS**.

It should edit static HTML fragments directly in a GitHub repository using the GitHub REST API.

The CMS should use this workflow:

```txt
GitCMS admin
    ↓ reads/writes
content branch
    ↓ publish
main branch
    ↓ GitHub Pages
live website
```

No backend.  
No database.  
No server-side code.  
No build step required.

---

## Deliverables

Produce these files:

```txt
admin.html
gitcms.config.json
fragments.json
docs/index.html
docs/about.html
docs/contact.html
docs/assets/style.css
docs/assets/media/.gitkeep
README.md
```

The `admin.html` file should be self-contained, with inline CSS and JavaScript.

---

## Repository Structure

Use this structure:

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
         └─ .gitkeep
```

---

## Branch Model

The admin must support:

```txt
work branch: content
publish branch: main
```

Admin reads from and writes to:

```txt
content
```

Publishing merges:

```txt
content → main
```

If `content` does not exist, create it from `main`.

---

## GitHub Auth

The admin login screen should ask for:

- GitHub repository URL
- GitHub Personal Access Token

The token needs:

```txt
Contents: Read and write
```

Store the token in `localStorage` for development convenience, but clearly comment that this is not secure for broader use.

---

## Config File

Create:

```txt
gitcms.config.json
```

With:

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

The admin should read this config from the repository.

Settings should allow editing:

- manifest path
- media folder
- media public prefix
- preview CSS paths

Save settings back to `gitcms.config.json` on the `content` branch.

---

## Fragment Manifest

Create:

```txt
fragments.json
```

With:

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

---

## Required Fragment Format

Use this preferred format in all sample HTML pages:

```html
<!-- cms:start hero -->
<section data-fragment="hero" data-label="Hero Section" id="hero" class="fragment hero">
  <h1>Editable heading</h1>
  <p>Editable content.</p>
</section>
<!-- cms:end hero -->
```

The comment markers define the editable boundary.

The `data-fragment` and `data-label` attributes describe the fragment.

The admin should edit only the inner HTML of the element.

---

## Backward Compatibility

Also support older fragments:

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

But the sample site should use the full marker format.

---

## Admin UI Requirements

The admin should include:

### Login screen

Fields:

- repository URL
- GitHub token
- Connect button

### Topbar

Buttons:

- GitHub Content
- Live Site
- Refresh
- Settings
- Diagnostics
- Media
- Publish
- Disconnect

Show badges for:

- repo name
- content branch

### Sidebar

Show files and fragments from `fragments.json`.

Example:

```txt
docs/index.html
  Hero Section
  Introduction
  Features
  Call to Action
```

### Editor

Show:

- fragment ID
- file path
- editable label
- raw inner HTML textarea
- preview pane

Buttons:

- Reset
- Save → Content

### Preview

Support:

```txt
Fragment | Page
```

Fragment preview shows only the fragment.

Page preview shows the full HTML page with the current edited fragment inserted.

The preview iframe must remain sandboxed:

```html
<iframe id="preview" sandbox></iframe>
```

Do not enable scripts.

---

## Preview CSS

Preview should load CSS listed in config:

```json
"preview": {
  "css": [
    "assets/style.css"
  ]
}
```

The admin should resolve this to GitHub raw content from the `content` branch:

```txt
docs/assets/style.css
```

Page preview should rewrite local asset paths to GitHub raw URLs.

Examples:

```txt
assets/style.css
assets/media/photo.jpg
```

should become raw GitHub URLs from the `content` branch.

---

## Media Library

Add a Media modal with:

- upload field
- refresh button
- thumbnail grid
- Insert button
- Delete button

Media upload should save images to:

```txt
docs/assets/media
```

Image insert should use:

```txt
assets/media/file.jpg
```

### Alt text dialog

When inserting an image, show a modal:

```txt
Alt text:
[________________]

[ ] Decorative image — use alt=""
```

Meaningful image output:

```html
<img src="assets/media/photo.jpg" alt="A useful description">
```

Decorative image output:

```html
<img src="assets/media/pattern.svg" alt="">
```

### Collision-safe upload

Before uploading, check whether the target path exists on the `content` branch.

If it exists, rename automatically:

```txt
photo.jpg → photo-2.jpg
```

Show a warning in the UI.

### Thumbnail cache handling

Use:

- local preview via `URL.createObjectURL(file)`
- cache-busting with file SHA or timestamp
- retry on broken thumbnail load

### Delete media

Delete from the `content` branch only.

Warn that the live site changes only after publishing.

If the image appears in loaded fragments, show a usage warning.

---

## Validation Requirements

Add validation for:

### Config

Warn if:

- missing `workBranch`
- missing `manifestPath`
- missing `media.dir`
- missing `media.publicPrefix`
- `/assets/media/` is used on a GitHub Pages project site
- invalid `preview.css`

### Manifest

Warn if:

- invalid JSON
- manifest is not an array
- duplicate fragment IDs
- missing `id`
- missing `file`
- missing `label`
- referenced HTML file is missing
- manifest fragment is not found in the HTML

### Markers

Warn if:

- `cms:start` has no matching `cms:end`
- duplicate marker IDs
- marker ID does not match `data-fragment`
- missing `data-fragment`
- missing `data-label`
- marker contains no valid element
- marker element is unclosed

Show warnings in Diagnostics.

---

## Diagnostics Modal

Show:

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

Include:

- Refresh button
- Copy button
- Close button

---

## Save Behavior

When saving:

- write changes to the `content` branch
- use the latest live `content` file as base
- apply dirty fragments to that file
- update `fragments.json` labels if labels changed
- show success/failure messages

If the fragment cannot be found, throw an error. Do not silently commit unchanged content.

---

## Publish Behavior

Before publishing:

- compare `main...content`
- show changed files
- show statuses: added, modified, deleted, renamed
- warn about unsaved changes

Publishing should merge:

```txt
content → main
```

Handle merge conflicts with clear messages and a GitHub compare link.

---

## Sample Site

Build a sample site called:

```txt
Northwind Studio
```

Use three pages:

```txt
docs/index.html
docs/about.html
docs/contact.html
```

Use shared CSS:

```txt
docs/assets/style.css
```

Use marker-based fragments.

---

## Sample `docs/index.html`

Include fragments:

- `hero`
- `intro`
- `features`
- `cta`

Use marker format:

```html
<!-- cms:start hero -->
<section data-fragment="hero" data-label="Hero Section" id="hero" class="fragment hero">
  <h1>Hello from Northwind</h1>
  <p class="lede">Northwind Studio designs small tools for focused teams.</p>
</section>
<!-- cms:end hero -->
```

---

## Sample `docs/about.html`

Include fragments:

- `team`
- `mission`

---

## Sample `docs/contact.html`

Include fragments:

- `map`
- `contact`

---

## CSS Style Direction

Create a clean editorial design:

- off-white background
- dark text
- strong serif headings
- simple navigation
- centered max-width layout
- cards/grid
- styled buttons
- responsive layout

Use fonts from Google Fonts if desired.

---

## Security Requirements

- iframe preview must be sandboxed
- do not run arbitrary scripts in preview
- disable scripts in full-page preview
- token storage must include a security TODO comment
- recommend fine-grained PAT

---

## Output Quality

The result should be directly usable.

The JavaScript should be clear and organized into sections:

```txt
helpers
GitHub API
config
validation
fragment parsing
loading
rendering
editing
preview
media
settings
diagnostics
publishing
events
```

Use plain browser APIs only.

No framework.

No build step.

---

## Acceptance Checklist

The project is complete when:

- admin connects to repo
- config loads
- fragments load from `content`
- validation warnings appear when expected
- fragments can be edited
- changes save to `content`
- media uploads to `docs/assets/media`
- images insert with alt text
- media can be deleted
- preview CSS works
- page preview works
- publish summary works
- publishing merges `content → main`
- live GitHub Pages site updates after publish
