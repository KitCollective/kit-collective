# Status model: To-do dispatches, Approval waits for a human, Blocked, Post-Merge precedes Done

Nicklas, 2026-10-11. Status: accepted; partly superseded by ADR-0066 (an answered `Approval` resumes in its Issue thread and never goes back to `To-do`). Supersedes the status names (not the behaviour) in ADR-0022, ADR-0024, ADR-0025, ADR-0028 and ADR-0049: where they say `Implementing` read `In Progress`, where they say `Ready for merge` read `Approval`, where they say dispatch from `Backlog` read `To-do`, and where they say `Parked` read `Backlog` (deferred) or `Blocked` (waiting for another issue). Their bodies are not rewritten.

## The model

An issue stops for one of three reasons, and each has its own status:

1. **A human is needed** (a question, a yes/no permission, a plan to approve, or the merge approval) -> `Approval`.
2. **Started work needs another issue done first** -> `Blocked`. It requires at least one unresolved `blockedBy`; if a person is needed it is `Approval`, not `Blocked`. A not-yet-started issue with an unresolved `blockedBy` stays in `To-do` and is not dispatchable.
3. **The owner defers it** -> `Backlog`. `Parked` is removed from the model.

| Status | Linear type | Role |
| --- | --- | --- |
| Triage | triage | inbox (Linear built-in, not in config) |
| Backlog | backlog | unshaped or deferred; not ready, never dispatched |
| To-do | unstarted | dispatch status (`dispatch.state`); the only unstarted status |
| Blocked | started | started work waiting for another issue |
| In Progress | started | claimed and coding (was Implementing) |
| In Review | started | pre-review gate passed, review running |
| Approval | started | waiting for a human at any stage (was Ready for merge) |
| Merging | started | approved; PR enqueued, merging |
| Post-Merge | started | PR merged; verifying that the integration lane is green, then reap |
| Done | completed | only after `node scripts/gate.mjs land <pr> --issue KIT-n` exits 0 |
| Canceled / Duplicate | canceled | unchanged |

Dispatch = `To-do` + label `ready-for-agent` + unblocked (+ Agent field empty). `/to-tickets` publishes to `dispatch.state` because its quiz step is the human's approval. A merge fail goes back to `In Progress`. `sessionCheck` treats In Progress, In Review, Approval, Merging, Post-Merge and Blocked as claimed, and Done, Canceled and Duplicate as terminal. A Blocked issue with an unresolved blocker is closed (`blocked by KIT-m`); with all blockers Done or Canceled it is open with a note to move it to To-do first. In any other unfinished state (To-do, Backlog, a working stage) an unresolved blocker also closes `sessionCheck`, also on resume.

## Board columns (canonical)

Left to right: Triage, Backlog, To-do, Blocked, In Progress, In Review, Approval, Merging, Post-Merge, Done, then Canceled and Duplicate.

| Column | Meaning |
| --- | --- |
| Triage | inbox; the owner accepts or rejects |
| Backlog | not ready, or deferred; the owner shapes |
| To-do | dispatch: `ready-for-agent` + unblocked; the orchestrator claims |
| Blocked | started work waiting for another issue (unresolved `blockedBy`); the flow moves it to To-do when all blockers are Done or Canceled |
| In Progress | lead plans, engineer builds; leaves when the pre-review gate is green |
| In Review | fresh reviewer; green -> Approval, red -> back to In Progress |
| Approval | waits for a human: the approver (or the auto label), an answer, or a decision |
| Merging | the approver moved it here = merge approval; PR enqueued |
| Post-Merge | PR merged; land gate verifying; GitHub automation sets it on merge |
| Done | only after `gate.mjs land` is OPEN |
| Canceled / Duplicate | unchanged |

The owner's only moves are Triage -> Backlog/To-do, Approval -> To-do (an answer) and Approval -> Merging (merge approval). The flow makes every other move, including into Approval and Blocked.

## Approval is cross-stage

`Approval` is where any stage parks an issue that needs a person. The labels already exist; no label is added:

- `Approval` + `needs-info`: the agent asks a question.
- `Approval` + `ready-for-human`: the agent needs a yes/no decision or permission (also a lead `plan-approval`).
- `Approval` with neither: review is green and the approver may merge.

The question and where to resume go under a new workpad section `### Waiting` (what is asked, the stage it came from, `Asked: <date>`). The human answers in a Linear comment and moves the issue to `To-do`; any answer goes back to `To-do`, never to a specific stage. The flow resumes it with `--resume` from the workpad. `ready-for-agent`, `needs-info` and `ready-for-human` are in the Linear label group Triage, which is single-select (checked read-only through the API: `groupType` is `singleSelect`; a real label write was not tried). So stopping is one atomic `node scripts/linear.mjs label <KIT-n> swap ready-for-agent needs-info` (or `ready-for-human`) together with the state move to `Approval`, and the claim is `swap needs-info ready-for-agent` (or from `ready-for-human`) and then `Resumed: <date>` under `### Waiting`. `session-check` closes on `needs-info` / `ready-for-human` while the issue is in `Approval` (or Backlog, Triage, a working stage) and returns OPEN with `answered: ...` in `To-do`; `signal-up` and `wontfix` stay hard stops everywhere. A `To-do` issue that carries `needs-info` / `ready-for-human` has no `ready-for-agent`, so it is not auto-dispatchable and resumes only when a human-started session names it. The human only moves the card.

Result lines (no grammar change): an Engineer or Lead result `blocked` whose sentence starts `needs-human:` makes the orchestrator move the issue to `Approval` with the right label and fill `### Waiting`; a sentence starting `blocked-by KIT-m:` makes it relate the issue with `node scripts/linear.mjs block <KIT-n> --by <KIT-m>` and move it to `Blocked`; `plan-approval` is `Approval` + `ready-for-human`. `node scripts/linear.mjs block` fails on an existing relation and does not detect cycles. A dependency the agent discovers is filed with `signal-up` (it lands in Triage, the owner accepts it), then `block`. At queue-build time a Blocked issue whose blockers are all Done or Canceled is moved to To-do.

An issue in `Approval` must never be read as merge permission.

## Why Merging stays

PRs are opened with the owner's own GitHub account, and GitHub does not let you approve your own PR, so the approving review cannot be the merge signal. The approver moving the issue to `Merging` is merge permission (`MERGE_PERMISSION_STATUS` in `scripts/lib/land-policy.mjs`, unchanged). Because `Approval` now also holds questions and decisions, only the move to `Merging` counts, never the status `Approval`.

## Why Post-Merge

Linear's GitHub integration moves an issue to Done when the PR merges, before the land gate says OPEN. With a `Post-Merge` status the integration points at `Post-Merge`, so only the land gate moves an issue to `Done`. A land gate that is not open leaves the issue in `Post-Merge`. `blockedBy` does not resolve there (it is a `started` status).

## Why Parked is removed and not renamed

Linear cannot change a status type after creation, and `Parked` is `unstarted`. `Blocked` must be `started` (the work has begun), so it is a new status, and `Parked` is deleted once empty.

## Migration (Linear UI, before this PR merges; no issue is in flight)

Order matters. Scripts resolve statuses by name, so if the PR merges before steps 1 and 2, anything that resolves `In Progress`, `To-do` or `Blocked` by name fails.

0. Inspect first. Run `LINEAR_API_KEY=... node .cursor/skills/bootstrap-linear/scripts/bootstrap-linear.mjs --dry-run` with the new config and compare with Settings -> Workflow. The old config aliased `Todo` -> Parked and `In Progress` -> Implementing, so Linear may already have statuses named `Todo` and/or `In Progress`. If `Todo` exists, rename it to `To-do` (type unstarted) instead of creating a second one. If an `In Progress` status already exists, resolve the clash before renaming `Implementing`.
1. Rename `Implementing` -> `In Progress` and `Ready for merge` -> `Approval` (renaming keeps issues and history).
2. Create `To-do` (unstarted, `#e2e2e2`; or the renamed `Todo`), `Post-Merge` (started, `#0e7a5a`) and `Blocked` (started, `#eb5757`).
3. Move every issue in `Parked` to `Backlog` (or to `Blocked` if it waits for another issue; then also set `blockedBy`), confirm `Parked` is empty, then delete the `Parked` status.
4. GitHub automation: "PR merged" -> `Post-Merge`, not `Done`.
5. Review `Backlog` issues with `ready-for-agent` and move the ones that should dispatch to `To-do`.
6. Column order (Settings -> Teams -> Engineering -> Workflow). Linear sorts by type group, then position, and a new status lands last in its group. Target: Triage, Backlog, To-do, Blocked, In Progress, In Review, Approval, Merging, Post-Merge, Done, Canceled, Duplicate. To-do is the only unstarted status. In the started group drag `Blocked` above `In Progress` and keep In Progress, In Review, Approval, Merging, Post-Merge after it (drag `Post-Merge` below `Merging`).
7. Regenerate `linear.setup.json` with the bootstrap skill (never hand-edit ids). It still has the old names until then.

`scripts/bootstrap-linear.mjs` cannot rename, so run it only after steps 1 to 3 are done by hand.
