# GitCMS v1.1.3 Diagnostics Fix

Fixes Diagnostics button not opening.

## Cause

A stale diagnostics field still referenced `BranchHeadCache`, which had been removed when the content-tree model replaced the earlier cache approach.

That caused a runtime error when Diagnostics was opened.

## Fix

- Removed stale `BranchHeadCache` diagnostics field
- Made Diagnostics rendering defensive
- Bumped visible version to `1.1.3-content-tree`
