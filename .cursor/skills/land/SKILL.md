---
name: land
description: Merges the GitHub PR for a Linear issue after the approver moved it to Merging. Integration lane only. Use when an issue status becomes Merging. Merged moves it to Post-Merge; Done only after the land gate is open.
---

# Land

Read [../_shared/factory.md](../_shared/factory.md). Details: [references/merge.md](references/merge.md).

The merge gate is `scripts/lib/land-policy.mjs` (`landAtMergeGate`). The archived Pi harness job `land.mjs` called that gate at the seam — see [pi-harness-archived.md](../../docs/agents/pi-harness-archived.md). `gh pr merge --auto` only enqueues the PR in the lane's merge queue; `landAtMergeGate` returns `queued` and the issue stays `Merging` until the PR is `MERGED`. Do not merge from `Post-Merge` or `Done`; both mean the PR is already merged. `Post-Merge` is set by Linear's GitHub automation on merge, or by you when you see `MERGED`; `Done` only after `node scripts/gate.mjs land <pr> --issue KIT-n` exits 0.

A merged slice owes no Device flows run on the integration lane (ADR-0049). The five regression flows run on request at a milestone or before a promotion to `staging`: `E2E_FLOWS=regression apps/mobile/.maestro/device-run.sh`.

After merge success and `Done` (reached through `Post-Merge` and the land gate), follow [reap-worktree/SKILL.md](../reap-worktree/SKILL.md) to verify integration and reap the issue worktree.
