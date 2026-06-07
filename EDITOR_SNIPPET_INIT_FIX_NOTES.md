# GitCMS v1.1.47 Editor Snippet Init Fix

Bug fix.

## Problem

v1.1.46 rendered configurable snippet buttons immediately in `05-snippets.js`.

But `EditorUtils` is declared later in `07-editor-utils.js`, so the browser could throw:

```txt
Cannot access 'EditorUtils' before initialization
```

## Fix

The snippets module now only declares functions.

Initial rendering happens at the end of boot in:

```txt
src/js/16-prefill.js
```

after `EditorUtils` is initialized.

Config-loaded refreshes still happen after connect/settings save.

## Version

```txt
1.1.47-editor-snippet-init-fix
```
