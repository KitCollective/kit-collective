# Merge

The `approver` moving the issue to `Done` is merge approval.

1. Status must be `Done`. Otherwise stop.
2. Linked PR must target `lanes.integration`, checker passed, CI green.
3. `gh pr merge` (no `--force`). Never `lanes.staging` or `lanes.production`.
4. Merge fail → `Implementing` and write the merge error under workpad `### Review feedback`. Success → stay `Done`, record the SHA in the workpad.

Never force-push the integration lane.
