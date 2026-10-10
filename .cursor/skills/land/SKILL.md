---
name: land
description: Merges the GitHub PR for a Linear issue after the approver moved it to Merging. Integration lane only. Use when an issue status becomes Merging. Moves to Done only after merge succeeds.
---

# Land

Read [../_shared/factory.md](../_shared/factory.md). Details: [references/merge.md](references/merge.md).

The merge gate is `scripts/lib/land-policy.mjs` (`landAtMergeGate`). The archived Pi harness job `land.mjs` called that gate at the seam — see [pi-harness-archived.md](../../docs/agents/pi-harness-archived.md). `gh pr merge --auto` only enqueues the PR in the lane's merge queue; `landAtMergeGate` returns `queued` and the issue stays `Merging` until the PR is `MERGED`. Do not merge from `Done`; `Done` means the PR is already on `lanes.integration`.

A merged slice owes no Device flows run on the integration lane (ADR-0049). The five regression flows run on request at a milestone or before a promotion to `staging`: `E2E_FLOWS=regression apps/mobile/.maestro/device-run.sh`.

After merge success and `Done`, follow [reap-worktree/SKILL.md](../reap-worktree/SKILL.md) to verify integration and reap the issue worktree.
