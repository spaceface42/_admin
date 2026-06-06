# GitCMS v1.1.7 Preview Blob

Fixes preview iframe staying white/blank after save or publish in local `file://` sessions.

## Change

The preview no longer relies primarily on:

```js
iframe.srcdoc = html
```

Instead it creates a fresh Blob URL every time:

```js
const blob = new Blob([html], { type: 'text/html' });
iframe.src = URL.createObjectURL(blob);
```

If Blob preview fails, it falls back to `srcdoc`.

## Version

```txt
1.1.7-preview-blob
```
