# Rebuild From Zero Brief

Use this document as the implementation brief for rebuilding the JSON-backed static site system from scratch.

The system has two repositories:

```txt
_admin     -> browser-based editor and GitHub API writer
_blackhole -> administered site source, JSON data, templates, build script, deploy workflow
```

Keep this separation clear. The admin edits content and writes files to GitHub. The administered site builds and deploys the public website.

## Goals

- Let a non-developer edit page records, images, publishing state, templates choice, and navigation labels.
- Let a designer/developer own HTML templates, partials, and CSS.
- Store source-of-truth content as boring JSON files in Git.
- Generate a static site from JSON and templates.
- Deploy through GitHub Actions and GitHub Pages artifacts.
- Do not commit generated HTML output.

## Non-Goals

- Do not build a full CMS.
- Do not put layout, color, typography, or responsive behavior in JSON.
- Do not edit template HTML inside the browser admin in the first version.
- Do not invent a large template language.
- Do not commit `_docs/` or `docs/` generated output.

## Repository Layout

Admin repo:

```txt
_admin/
  index.html
  admin.js
  styles.css
  README.md
```

Administered site repo:

```txt
_blackhole/
  admin.config.json
  package.json
  data/
    meta.json
    navigation.json
    pages/
      page-id.json
    assets/
      page-id/
        cover.png
  public.source/
    site.css
    index.html
    templates/
      home.html
      page.html
      gallery.html
    partials/
      menu.html
  scripts/
    build-site.js
  .github/
    workflows/
      build-docs.yml
```

`public.source/index.html` may be a local note page for template authors. The build should use `public.source/templates/*.html`.

## Data Contract

`data/meta.json` indexes page records:

```json
{
  "version": 1,
  "pages": [
    {
      "id": "about",
      "slug": "about",
      "type": "page",
      "title": "About",
      "subtitle": "",
      "published": true,
      "order": 1,
      "file": "data/pages/about.json",
      "updatedAt": "2026-06-03T00:00:00.000Z"
    }
  ]
}
```

Each page file contains the actual content:

```json
{
  "id": "about",
  "slug": "about",
  "type": "page",
  "template": "",
  "title": "About",
  "subtitle": "",
  "body": "",
  "coverImage": null,
  "images": [],
  "published": true,
  "createdAt": "2026-06-03T00:00:00.000Z",
  "updatedAt": "2026-06-03T00:00:00.000Z"
}
```

Image object:

```json
{
  "id": "cover",
  "src": "data/assets/about/cover.png",
  "alt": "Short image description",
  "caption": ""
}
```

Navigation file:

```json
{
  "main": [
    {
      "label": "Home",
      "href": "index.html"
    },
    {
      "label": "Work",
      "page": "work"
    },
    {
      "label": "About",
      "page": "about"
    }
  ]
}
```

Navigation JSON controls only:

- label
- order
- page target
- direct URL target
- visibility later if needed

Navigation JSON must not control:

- colors
- fonts
- layout
- hover behavior
- mobile behavior

## Admin Config Contract

The administered repo must contain `admin.config.json`:

```json
{
  "version": 1,
  "name": "Blackhole Site",
  "paths": {
    "meta": "data/meta.json",
    "navigation": "data/navigation.json",
    "pages": "data/pages",
    "assets": "data/assets",
    "source": "public.source",
    "output": "_docs"
  },
  "site": {
    "previewUrl": "https://spaceface42.github.io/_blackhole/"
  },
  "uploads": {
    "maxImageSize": 2097152,
    "allowedImageTypes": ["image/jpeg", "image/png", "image/webp", "image/gif"]
  },
  "contentTypes": [
    {
      "type": "page",
      "label": "Page",
      "fields": [
        { "name": "title", "label": "Title", "type": "text", "required": true },
        { "name": "subtitle", "label": "Subtitle", "type": "text" },
        { "name": "template", "label": "Template", "type": "text" },
        { "name": "body", "label": "Body", "type": "textarea" },
        { "name": "coverImage", "label": "Cover image", "type": "image" },
        { "name": "images", "label": "Images", "type": "gallery" }
      ]
    },
    {
      "type": "gallery",
      "label": "Gallery",
      "fields": [
        { "name": "title", "label": "Title", "type": "text", "required": true },
        { "name": "subtitle", "label": "Subtitle", "type": "text" },
        { "name": "template", "label": "Template", "type": "text" },
        { "name": "coverImage", "label": "Cover image", "type": "image" },
        { "name": "images", "label": "Images", "type": "gallery" }
      ]
    }
  ],
  "build": {
    "command": "npm run build",
    "output": "_docs"
  }
}
```

## Site Generator

Build command:

```sh
npm run build
```

Build output:

```txt
_docs/
```

`_docs/` must be ignored by Git.

Template selection rule:

```txt
record.template || record.type || "page"
```

Examples:

- record type `page` uses `public.source/templates/page.html`
- record type `gallery` uses `public.source/templates/gallery.html`
- record with `"template": "gallery-grid"` uses `public.source/templates/gallery-grid.html`
- missing custom template falls back to `page.html`

Homepage:

- Generate `_docs/index.html` from `public.source/templates/home.html`.
- Use the first published record as the current record for homepage fields, unless a dedicated home record is introduced later.

Page output:

- Generate one HTML file per published record.
- File name is `{slug}.html`.
- Copy `data/assets/` to `_docs/data/assets/`.
- Copy static files from `public.source/` to `_docs/`.
- Remove `templates/` and `partials/` from `_docs/` after copying. Template source files should not be deployed.

Supported tags:

```html
<database field="title"></database>
<database id="about" field="title"></database>
<database field="body"></database>
<database field="coverImage"></database>
<database field="images"></database>
<database-list type="page"></database-list>
<database-link id="about"></database-link>
<partial name="menu"></partial>
<site-menu-items name="main"></site-menu-items>
```

Rendering rules:

- Escape all text fields.
- Convert `body` into escaped paragraphs.
- Render `coverImage` as a `<figure>`.
- Render `images` as a gallery.
- Render menu items from `data/navigation.json`.
- A navigation item with `page` points to that page record's generated URL.
- A navigation item with `href` uses the direct URL.
- If both `page` and `href` are present, prefer `href` in the site generator, but the admin should clear `href` when a page target is chosen.

## GitHub Actions Deploy

Use GitHub Pages artifact deployment.

Workflow behavior:

- Trigger on pushes to `main`.
- Trigger when data, templates, source CSS, build script, package file, config, or workflow changes.
- Run `npm run build`.
- Upload `_docs/` with `actions/upload-pages-artifact`.
- Deploy with `actions/deploy-pages`.

Required permissions:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

Repository Pages setting:

```txt
Build and deployment source: GitHub Actions
```

Do not use:

```txt
main branch / docs folder
```

## Admin App

Entry point:

```txt
index.html
```

Do not duplicate admin markup into a second entry page. If `admin.html` exists, either remove it or make it redirect to `index.html`.

The admin should:

- accept a GitHub token
- accept a GitHub repository URL
- load `admin.config.json`
- load `data/meta.json`
- load `data/navigation.json`
- load page files listed in `meta.json`
- edit page records
- edit optional page `template`
- edit `published`
- upload cover/gallery images
- edit main navigation labels/order/targets
- save page files, `meta.json`, `navigation.json`, uploads, and deletions in one Git commit
- check if the remote branch moved before saving
- poll the site build workflow after saving
- show a public-site link when the build succeeds

The admin should not:

- build the site in the browser
- edit CSS
- edit template HTML in the first version
- store GitHub tokens in Git

## Admin Save Flow

1. User clicks **Save to GitHub**.
2. If the page form has a draft, save it into local DB first.
3. Read current navigation rows into `db.navigation`.
4. Fetch current remote branch head.
5. Warn if remote changed since last load.
6. Create blobs for:
   - each page JSON file
   - `data/meta.json`
   - `data/navigation.json`
   - pending uploaded images
   - deleted page files with `sha: null`
7. Create one Git tree.
8. Create one Git commit.
9. Update branch ref with `force: false`.
10. Poll GitHub Actions for the pushed commit.

## Admin Local Drafts

Use browser `localStorage`, scoped per administered repo:

```txt
github-json-page-db-v2:{owner}/{repo}
```

Draft data shape:

```json
{
  "meta": {},
  "navigation": {},
  "pages": {}
}
```

Strip `pendingFile` values before serializing drafts.

## Path Safety

Validate all configured paths:

- no empty paths
- no absolute repo paths
- no `..`
- no URL paths for repository files

Validate page files:

- every page file path must stay inside configured `paths.pages`

Validate uploads:

- every uploaded image path must stay inside configured `paths.assets`

Validate deleted files:

- deleted page files must stay inside configured `paths.pages`

## First Implementation Order

1. Create administered repo data contract and example JSON files.
2. Create site templates and partials.
3. Build `scripts/build-site.js`.
4. Add GitHub Actions artifact deployment.
5. Build admin connection and config loading.
6. Add page editor and GitHub save flow.
7. Add image upload.
8. Add navigation editor.
9. Add template field.
10. Add build polling.
11. Add docs and troubleshooting.

## Common Failure Modes

Admin cannot connect:

- wrong repository URL
- token lacks `Contents: Read and write`
- `admin.config.json` missing or invalid
- admin entry HTML and `admin.js` are out of sync
- browser is opened to the administered site's `public.source/index.html` instead of `_admin/index.html`

Images do not appear:

- template does not include `<database field="coverImage"></database>` or `<database field="images"></database>`
- asset was not uploaded to `data/assets/`
- build did not copy `data/assets/` into `_docs/data/assets/`
- image path points outside the deployed output

Menu does not update:

- admin did not save `data/navigation.json`
- template does not include `<partial name="menu"></partial>`
- menu partial does not include `<site-menu-items name="main"></site-menu-items>`
- GitHub Actions deployment has not completed yet

Pages do not appear:

- page has `published: false`
- `data/meta.json` does not reference the page file
- page file is missing
- slug sanitizes to an unexpected filename
- template is missing and fallback failed

## Design Boundary

Keep this line firm:

```txt
JSON = content and routing hints
templates = HTML structure
CSS = visual design
build script = deterministic generation
admin = editing and GitHub writing
```

If a future feature wants layout controls in JSON, pause first. Most visual choices belong in templates or CSS.

