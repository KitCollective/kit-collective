---
name: land
description: Merges the GitHub PR for a Linear issue after the approver moved it to Merging. Integration lane only. Use when an issue status becomes Merging. Moves to Done only after merge succeeds.
---

# Land

Read [../_shared/factory.md](../_shared/factory.md). Details: [references/merge.md](references/merge.md).

The merge gate is `scripts/lib/land-policy.mjs` (`landAtMergeGate`). Tests fake `gh` at that seam (`scripts/tests/land-policy.test.mjs`). Do not merge from `Done`; `Done` means the PR is already on `lanes.integration`.
