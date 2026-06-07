# GitCMS Release Checklist

Use this before tagging a stable release.

## Automated checks

```bash
npm run build
npm run check
npm test
```

Optional when dependencies are installed:

```bash
npm run format:check
npm run lint
```

## Manual checks

Open `admin.html` and verify:

```txt
connect
diagnostics opens
load fragments
edit fragment
preview fragment
preview page
save to content
refresh/reopen admin
upload media
insert media
copy media URL
delete media
publish to main
check live site
```

## Diagnostics expected

```txt
GitCMS version: current release version
Main fallback: disabled
CMS source branch: content
Content commit SHA: present after load
Content tree SHA: present after load
```

## Tag release

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

## Publish workflow check

After Save → Content:

```txt
Publish modal should show changed files.
```

After Publish:

```txt
main == content
Publish modal should show Nothing to publish.
```

GitCMS should not perform:

```txt
main → content
```

## Manual regression file

Before tagging, run:

```txt
MANUAL_REGRESSION_TEST.md
```

## Stable docs

Confirm these files exist:

```txt
STABLE.md
PUBLISH_WORKFLOW.md
CURRENT_VERSION.md
```
