# GitCMS v1.1.49 CI Quality Fix

Fixes the GitHub Actions quality failure seen on commit `ed6705a`.

## Problem

The workflow ran `npm run format:check` and `npm run lint`, but the committed source was not Prettier-formatted. ESLint also checked `src/js/*.js` as isolated files, while GitCMS intentionally concatenates those browser files into one runtime. That made cross-file globals look undefined to ESLint.

## Fix

```txt
formatted source/test/docs files with Prettier
updated ESLint config for concatenated browser modules
kept no-undef enabled for real ES modules/tests
kept docs/admin.html verification after build
```

## Version

```txt
1.1.49-ci-quality-fix
```
