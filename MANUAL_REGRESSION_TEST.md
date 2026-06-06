# GitCMS Manual Regression Test

Run this before tagging a release.

## 1. Connect

```txt
Open admin.html
Connect to repository
Open Diagnostics
Confirm version: 1.1.28-release-hardening
Confirm content branch: content
Confirm default branch: main
Confirm main fallback: disabled
```

## 2. Edit and save

```txt
Open Hero Section
Change text
Save → content
Refresh admin
Confirm changed text is still visible
```

Expected:

```txt
Admin reloads from content
No 2-3 login delay
Preview still renders
```

## 3. Publish

```txt
Open Publish modal
Confirm changed file appears
Click Publish
Wait for success toast
Open Publish modal again
```

Expected:

```txt
Modal says: Nothing to publish
main == content
```

## 4. Edit again after publish

```txt
Edit Hero Section again
Save → content
Open Publish modal
```

Expected:

```txt
Publish is available again
Changed file appears
```

## 5. Media upload

```txt
Open Media
Upload image
Insert image into a fragment
Save → content
Refresh admin
Confirm image still appears
Publish
Check live site
```

Expected:

```txt
Image path uses assets/media/
Preview image loads
Live site image loads
```

## 6. Preview

Test both modes:

```txt
Fragment preview
Page preview
```

Expected:

```txt
No blank white iframe
CSS loads in preview
Selected section displays correctly
```

## 7. Diagnostics

```txt
Open Diagnostics
Scroll inside modal
Copy diagnostics
Close from top-right X
Close from bottom button
```

Expected:

```txt
No browser zoom needed
Long values wrap/scroll
```

## 8. Negative checks

Confirm these do not happen:

```txt
Publish available immediately after publish
Old text: Sync main → content, then merge content → main
Preview stuck at Loading preview
Admin loads from main instead of content
```

## Release pass criteria

Release is good only if:

```txt
Save works
Reload works
Preview works
Media works
Publish works
Publish becomes unavailable after publish
Publish becomes available again after new save
Diagnostics works
```
