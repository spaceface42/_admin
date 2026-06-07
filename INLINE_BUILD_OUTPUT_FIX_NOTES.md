# GitCMS v1.1.50 Inline Build Output Fix

Bug fix.

## Problem

After formatting, `src/index.html` changed:

```html
<link rel="stylesheet" href="./admin.css">
```

to:

```html
<link rel="stylesheet" href="./admin.css" />
```

The build script was using an exact string replacement, so it did not inline CSS anymore.
That made the standalone `admin.html` preview unstyled and showed the SVG logo huge.

## Fix

`build-admin.mjs` now uses robust regex replacement for:

```txt
admin.css
admin.js
```

and fails the build if either asset remains external in the built output.

## Verified

Both outputs are standalone and identical:

```txt
admin.html
docs/admin.html
```

## Version

```txt
1.1.50-inline-build-output-fix
```
