# GitCMS v1.1.46 Configurable Editor Snippets

Editor usability improvement.

## Added

Editor snippets can now be configured in:

```txt
gitcms.config.json
```

Example:

```json
{
  "editor": {
    "snippets": [
      {
        "id": "alert",
        "label": "Alert box",
        "hint": "<div class=\"alert\">",
        "quick": true,
        "html": "<div class=\"alert\">\n  <p>{{text|Alert text}}</p>\n</div>"
      }
    ]
  }
}
```

## Placeholder syntax

```txt
{{text|Fallback text}}
{{attr:text|Fallback attribute text}}
{{items|First item\nSecond item}}
```

`{{text|...}}` escapes text for HTML content.

`{{attr:text|...}}` escapes text for HTML attributes.

## Behavior

Built-in snippets remain available. Config snippets override matching built-in IDs or add new snippets.

## No backend logic changes

No changes to:

```txt
save
publish
content loading
cache
GitHub API
```

## Version

```txt
1.1.46-configurable-editor-snippets
```

`{{items|...}}` creates `<li>` rows from selected lines or fallback lines.
