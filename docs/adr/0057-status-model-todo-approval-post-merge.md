# Status model: To-do dispatches, Approval waits, Post-Merge precedes Done

Nicklas, 2026-10-11. Status: accepted. Supersedes the status names (not the behaviour) in ADR-0022, ADR-0024, ADR-0025, ADR-0028 and ADR-0049: where they say `Implementing` read `In Progress`, where they say `Ready for merge` read `Approval`, and where they say dispatch from `Backlog` read `To-do`. Their bodies are not rewritten.

## The model

| Status | Linear type | Role |
| --- | --- | --- |
| Triage | triage | inbox (Linear built-in, not in config) |
| Backlog | backlog | unshaped, not ready. No longer dispatchable |
| To-do | unstarted | dispatch status (`dispatch.state`): ready to be picked up |
| Parked | unstarted | parked |
| In Progress | started | claimed and coding (was Implementing) |
| In Review | started | pre-review gate passed, review running |
| Approval | started | review green, waiting for the approver (was Ready for merge); skipped when the auto label applies |
| Merging | started | approved; PR enqueued, merging |
| Post-Merge | started | PR merged; verifying that the integration lane is green, then reap |
| Done | completed | only after `node scripts/gate.mjs land <pr> --issue KIT-n` exits 0 |
| Canceled / Duplicate | canceled | unchanged |

Dispatch = `To-do` + label `ready-for-agent` + unblocked (+ Agent field empty). `/to-tickets` publishes to `dispatch.state` because its quiz step is the human's approval; `Backlog` is for unshaped work. A merge fail goes back to `In Progress`. `sessionCheck` treats In Progress, In Review, Approval, Merging and Post-Merge as claimed, and Done, Canceled and Duplicate as terminal.

## Board columns (canonical)

Left to right: Triage, Backlog, To-do, Parked, In Progress, In Review, Approval, Merging, Post-Merge, Done, then Canceled and Duplicate.

| Column | Meaning |
| --- | --- |
| Triage | inbox; the owner accepts or rejects |
| Backlog | not ready; the owner shapes |
| To-do | dispatch: `ready-for-agent` + unblocked; the orchestrator claims |
| Parked | set aside |
| In Progress | lead plans, engineer builds; leaves when the pre-review gate is green |
| In Review | fresh reviewer; green -> Approval, red -> back to In Progress |
| Approval | waits for the approver, or the auto label |
| Merging | the approver moved it here = merge approval; PR enqueued |
| Post-Merge | PR merged; land gate verifying; GitHub automation sets it on merge |
| Done | only after `gate.mjs land` is OPEN |
| Canceled / Duplicate | unchanged |

The owner makes only two moves: Triage -> Backlog/To-do and Approval -> Merging. Every other move is made by the flow.

## Why Merging stays

PRs are opened with the owner's own GitHub account, and GitHub does not let you approve your own PR, so the approving review cannot be the merge signal. The approver moving the issue to `Merging` is merge permission (`MERGE_PERMISSION_STATUS` in `scripts/lib/land-policy.mjs`, unchanged).

## Why Post-Merge

Linear's GitHub integration moves an issue to Done when the PR merges, before the land gate says OPEN. With a `Post-Merge` status the integration points at `Post-Merge`, so only the land gate moves an issue to `Done`. A land gate that is not open leaves the issue in `Post-Merge`. `blockedBy` does not resolve there (it is a `started` status).

## Migration (Linear UI, before this PR merges; no issue is in flight)

Order matters. Scripts resolve statuses by name, so if the PR merges before step 1 and 2, anything that resolves `In Progress` or `To-do` by name fails.

1. Rename `Implementing` to `In Progress` and `Ready for merge` to `Approval` (renaming keeps issues and history).
2. Create `To-do` (type unstarted, colour `#e2e2e2`) and `Post-Merge` (type started, colour `#0e7a5a`).
3. Team settings, GitHub automation: set "PR merged" to move the issue to `Post-Merge`, not `Done`.
4. Review issues in `Backlog` with `ready-for-agent` and move the ones that should dispatch to `To-do`.
5. Column order. Linear sorts columns by type group, then by position, and a new status lands last in its group. In Settings -> Teams -> Engineering -> Workflow: drag `To-do` above `Parked` inside the unstarted group, and keep the started group in the order In Progress, In Review, Approval, Merging, Post-Merge (drag `Post-Merge` below `Merging`).
6. `linear.setup.json` is tracked and holds state ids: regenerate it with the bootstrap-linear skill afterwards (never hand-edit ids). It still lists the old names until then; nothing that gates a merge reads it except the `Merging` id.

`scripts/bootstrap-linear.mjs` cannot rename, so it must not be run before step 1 and 2 are done by hand.
