# GitCMS Write Path Audit

Version:

```txt
1.1.36-write-path-audit
```

## Branch model

```txt
content = CMS source of truth
main    = deploy target only
```

## Audited write paths

| Operation | Write target | SHA source |
|---|---:|---|
| Save HTML fragment | `content` | `getFileForWrite(path, content)` |
| Save manifest labels | `content` | `getFileForWrite(fragments.json, content)` |
| Save missing manifest | `content` | `getFileForWrite(fragments.json, content)` |
| Save config | `content` | `getFileForWrite(gitcms.config.json, content)` |
| Upload media | `content` | new file path checked with `getFileForWrite(path, content)` |
| Delete media | `content` | `getFileForWrite(path, content)` when SHA missing |
| Publish | `main` | direct ref update to effective `content` commit SHA |

## Explicit rule

CMS writes must not read from `main` for write SHA resolution.

`main` is only written during Publish.
