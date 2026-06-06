# GitCMS v1.1.5 Preview Stability

Fixes a preview issue where the iframe could become white/blank after save/publish and selecting another fragment.

## Changes

- Preview rendering is now defensive.
- Preview errors render inside the iframe instead of silently going blank.
- The preview iframe is force-refreshed by briefly loading a loading document before the real preview.
- Preview CSS/media raw URLs now use the resolved content commit SHA when available, not the moving branch name.
- Page preview highlights the selected fragment.

## Version

```txt
1.1.5-preview-stability
```
