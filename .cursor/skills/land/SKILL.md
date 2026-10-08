---
name: land
description: Merges the GitHub PR for a Linear issue after the approver moved it to Merging. Integration lane only. Use when an issue status becomes Merging. Moves to Done only after merge succeeds.
---

# Land

Read [../_shared/factory.md](../_shared/factory.md). Details: [references/merge.md](references/merge.md).

The merge gate is `scripts/lib/land-policy.mjs` (`landAtMergeGate`). The archived Pi harness job `land.mjs` called that gate at the seam — see [pi-harness-archived.md](../../docs/agents/pi-harness-archived.md). Do not merge from `Done`; `Done` means the PR is already on `lanes.integration`.

After a merge of a slice with device-flow evidence, run the Device flows once on the integration lane's new head, as `docs/agents/device-flows.md` says: that run is the "before" the next such PR is compared against.

After merge success and `Done`, follow [reap-worktree/SKILL.md](../reap-worktree/SKILL.md) to verify integration and reap the issue worktree.
