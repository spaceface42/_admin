# GitCMS v1.1 Complete Package

This package contains a complete GitCMS setup:

- single-file admin
- split development source
- build script
- sample config
- sample fragments manifest
- marker-ready sample site
- documentation

## Required files for use

```txt
admin.html
gitcms.config.json
fragments.json
docs/
```

## Development source

```txt
src/index.html
src/admin.css
src/admin.js
build-admin.mjs
```

To rebuild the single-file admin:

```bash
node build-admin.mjs
```

## Branch model

```txt
GitCMS reads/writes: content
GitHub Pages publishes: main
Publish flow: content → main
```

## Recommended setup

Create the content branch:

```bash
git fetch origin
git checkout -b content origin/main
git push -u origin content
```

Then open `admin.html`, connect to your repo, and edit fragments.

## Config

See:

```txt
gitcms.config.json
```

## Fragment manifest

See:

```txt
fragments.json
```

## Fragment format

```html
<!-- cms:start hero -->
<section data-fragment="hero" data-label="Hero Section" id="hero" class="fragment hero">
  <h1>Editable heading</h1>
</section>
<!-- cms:end hero -->
```
