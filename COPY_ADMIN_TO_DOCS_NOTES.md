# GitCMS v1.1.48 Copy Admin to Docs

Build/workflow improvement.

## Changed

The build script now writes the generated admin app to both:

```txt
admin.html
docs/admin.html
```

## Why

When GitHub Pages is configured to publish from `docs/`, the admin can be served from:

```txt
https://<owner>.github.io/<repo>/admin.html
```

while still keeping a root `admin.html` for local/manual use.

## Workflow

The quality workflow now verifies:

```txt
docs/admin.html
```

exists after build.

## Version

```txt
1.1.48-copy-admin-to-docs
```
