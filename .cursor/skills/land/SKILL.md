---
name: land
description: Merges the GitHub PR for a Linear issue after the approver moved it to Merging. Integration lane only. Use when an issue status becomes Merging. Moves to Done only after merge succeeds.
---

# Land

Read [../_shared/factory.md](../_shared/factory.md). Details: [references/merge.md](references/merge.md).

The merge gate is `scripts/lib/land-policy.mjs` (`landAtMergeGate`). The harness job `harness/land.mjs` (`completeLand`) calls that gate with fake `gh` at the seam (`harness/tests/land.test.mjs`). Do not merge from `Done`; `Done` means the PR is already on `lanes.integration`.
