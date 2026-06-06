# GitCMS v1.1

GitCMS v1.1 keeps **Raw HTML as the source of truth** and adds lightweight HTML snippet buttons.

## New in v1.1

The editor now includes snippet buttons above the raw HTML textarea:

```txt
P | H2 | Lede | Button | List | Card
```

These insert plain HTML into the editor. They do not replace raw HTML editing.

## Snippets

### P

```html
<p>New paragraph</p>
```

### H2

```html
<h2>New heading</h2>
```

### Lede

```html
<p class="lede">Intro text</p>
```

### Button

```html
<a class="btn" href="contact.html">Call to action</a>
```

### List

```html
<ul>
  <li>First item</li>
  <li>Second item</li>
</ul>
```

### Card

```html
<div class="card">
  <h3>Card title</h3>
  <p>Card text.</p>
</div>
```

## Behavior

If text is selected in the editor, the snippet tries to use that selected text.

Examples:

- Select `Hello` and click `H2` → `<h2>Hello</h2>`
- Select multiple lines and click `List` → each line becomes an `<li>`

## Core rule

Raw HTML remains mandatory and always available.

```txt
Raw HTML = source of truth
Snippets = helper only
```

## Included features from v1

- content branch workflow
- marker-based fragments
- config/manifest/marker validation
- media upload
- media delete
- copy media URL
- roomier media cards
- media collision protection
- alt-text image insert dialog
- preview CSS
- fragment preview
- page preview
- diagnostics
- publish summary
