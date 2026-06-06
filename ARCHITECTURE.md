# GitCMS Architecture

Current branch model:

```txt
content = CMS source of truth
main    = deploy target only
```

## Browser module layout

```txt
src/js/00-api-utils.js             GitHub API path/header/body helpers
src/js/00-connect-utils.js         repo/connect helpers
src/js/00-content-source-utils.js  content tree/pinned write helpers
src/js/00-core.js                  constants, state, Store, path wrappers
src/js/01-github-api.js            GitHubApi client
```

## Build output

```txt
src/admin.js
admin.html
```

Runtime file:

```txt
admin.html
```
