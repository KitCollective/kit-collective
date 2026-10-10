# Merge

The `approver` moving the issue to `Merging` is merge approval.

1. Status must be `Merging`. Otherwise stop.
2. Linked PR must target `lanes.integration`, checker passed, CI green.
3. `gh pr merge <n> --merge --auto` (no `--force`). `lanes.integration` has a **merge queue**: `--auto` enqueues the PR and GitHub merges it once the queue's own `test` run on the combined state is green. The queue merges with a merge commit, so `--merge` stays. Never `lanes.staging` or `lanes.production`. Follow `scripts/lib/land-policy.mjs`; the archived Pi harness called it at the seam (see `docs/agents/pi-harness-archived.md`).
   `gh pr create` must pass `--base development` (repo default is `development`). Promotion creates are `--base staging --head development` or `--base production --head staging` only. The Cursor hook `.cursor/hooks/block-pr-lane.sh` denies the rest.
   Enqueueing is not merging: the issue stays `Merging` until `gh pr view <n> --json state,mergeCommit` says `MERGED`. Check once per turn; do not poll or `sleep` (the PI CI-sleep hook denies it).
4. Merge fail → `Implementing` and write the merge error under workpad `### Review feedback`. Merged (`state` = `MERGED`) → `Done`, record `mergeCommit` in the workpad. A PR the queue ejects (red `test` on the combined state, or a conflict) is a merge fail. Never `Done` on a failed merge.
5. Dependents stay blocked until the blocker is `Done` or `Canceled`. `Ready for merge` → `Merging` does not resolve `blockedBy`.

Never force-push the integration lane.
