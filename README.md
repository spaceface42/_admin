# JSON Site Admin

This is a browser admin for editing JSON content in an administered GitHub repository.

Open `index.html`, paste a GitHub token with `Contents: Read and write`, paste the administered repo URL, then click **Connect**.

The admin loads:

```txt
admin.config.json
data/meta.json
data/navigation.json
data/pages/*.json
```

The admin saves page JSON, `meta.json`, `navigation.json`, uploaded images, and deleted pages in one Git commit.

The admin does not build the site. The administered repo handles build and deploy through GitHub Actions.
