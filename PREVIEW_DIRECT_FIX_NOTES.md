# GitCMS v1.1.6 Preview Direct Fix

Fixes preview getting stuck at:

```txt
Loading preview...
```

## Cause

v1.1.5 used a two-step iframe refresh:

```txt
1. set srcdoc to Loading preview...
2. replace it with the real preview in requestAnimationFrame()
```

In some local/file:// browser sessions, step 2 did not reliably replace the temporary document.

## Fix

Preview now assigns the final preview HTML directly:

```js
frame.srcdoc = html;
```

The error fallback remains, so preview failures should render an error document instead of a white iframe.
