# JSON Site Admin

A generic browser admin for editing JSON page data and uploading files to a configured GitHub repository.

## Use

1. Open `index.html` locally or host this folder with GitHub Pages.
2. Paste a fine-grained GitHub token with `Contents: Read and write` for the administered site repo.
3. Paste the administered repository URL, for example `https://github.com/spaceface42/_blackhole`.
4. Click **Connect**. The admin loads `admin.config.json` from that repo.
5. Click **Load DB**, edit content, then **Save to GitHub**.

The token is stored only in this browser's `localStorage`. Use **Forget token** when done. Local drafts are stored per administered repository.
