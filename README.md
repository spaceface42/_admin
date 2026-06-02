# JSON Site Admin

A generic browser admin for editing JSON page data and uploading files to a configured GitHub repository.

This repository is only the admin tool. The content, templates, generated site, and build script live in a separate administered site repository.

## Architecture

```txt
_admin
  index.html
  admin.js
  styles.css

_blackhole
  admin.config.json
  data/
  public.source/
  scripts/
  docs/
```

The admin connects to an administered repository through the GitHub API. It reads that repository's `admin.config.json`, then uses the configured paths to load and save JSON records and uploaded image files.

## Use

1. Open `index.html` locally or host this folder with GitHub Pages.
2. Paste a fine-grained GitHub token with `Contents: Read and write` for the administered site repo.
3. Paste the administered repository URL, for example `https://github.com/spaceface42/_blackhole`.
4. Click **Connect**. The admin loads `admin.config.json` from that repo.
5. Click **Load DB**, edit content, then **Save to GitHub**.

The token is stored only in this browser's `localStorage`. Use **Forget token** when done. Local drafts are stored per administered repository.

## Repository URL

Use the GitHub repository URL, not the GitHub Pages URL.

Correct:

```txt
https://github.com/spaceface42/_blackhole
```

Not this:

```txt
https://spaceface42.github.io/_blackhole/
```

## Token

Create a fine-grained GitHub token for the administered site repository.

Required permission:

```txt
Contents: Read and write
```

Do not commit the token. The admin only stores it in the current browser's `localStorage`.

## Save Flow

When you click **Save to GitHub**, the admin first saves the visible form into the local JSON database, then uploads the JSON and pending image files to the configured repository.

After saving, reconnecting and clicking **Load DB** should show the latest saved data from GitHub.

## Administered Repo Requirements

Each administered repo must contain:

```txt
admin.config.json
data/meta.json
data/pages/
```

The default config used by `_blackhole` is documented in that repository.

## Publishing

The admin only writes JSON and uploaded files. It does not build the public site in the browser.

The administered repo is responsible for turning JSON into generated HTML, either by:

- running its build script locally and committing `docs/`, or
- using GitHub Actions to rebuild and publish after content changes.
