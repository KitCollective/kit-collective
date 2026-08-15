---
name: land
description: Merges the GitHub PR for a Linear issue after Nick moved it to Done. Development lane only. Use when an issue status becomes Done.
---

# Land

Nick moving the issue to `Done` is merge approval.

1. Status must be `Done`. Otherwise stop.
2. Linked PR must target `development`, checker passed, CI green.
3. `gh pr merge` (no `--force`). Never `staging` or `production`.
4. Merge fail → `Rework` + workpad. Success → stay `Done`, record the SHA in the workpad.

Never force-push `development`.
