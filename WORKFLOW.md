---
# Names, keys, and lanes live in factory.config.json — read that first.
# This file is the generic control-plane prompt. Do not hardcode a product here.
---

# Agent workflow

Linear is the control plane. Cursor Automations + Cloud Agents are the runtime.
This file is the contract. Automations must follow it, not a one-off prompt.

Load `factory.config.json` (product, team, states, lanes, approver, helper dir).
Working skills are `.cursor/skills/` (self-contained). Follow this file for status, land, and comments.

You are working on Linear issue `{{ issue.identifier }}`.

## Eligibility (dispatch)

The **planner** claims. Implement never claims from `dispatch.state`.

Planner may move an issue to `Implementing` **only** when all of these are true:

1. Status equals `dispatch.state` in factory config (default `Backlog`)
2. It is labelled `ready-for-agent` (when `dispatch.requireReadyForAgent` is true)
3. It has **no** unresolved `blockedBy` relations
4. It is not labelled `signal-up`
5. Linear **Agent** is empty (Assignee stays the human). If Agent is Cursor, skip and comment — that path starts a Cloud Agent and is not factory dispatch.

There is **no** concurrency cap. Unresolved `blockedBy` is what keeps a later slice out of `Implementing`. Among issues that pass, claim **all** currently eligible issues in `dispatch.priorityOrder` (default Linear: Urgent `1`, High `2`, Medium `3`, Low `4`, None `0`). Same rank: oldest first. Unset / None is last. Do not preempt `Implementing`. Priority is **claim order**, not eligibility — an Urgent issue without `ready-for-agent` still does not run.

If any eligibility check fails: **do not modify the issue**. Stop.

Never claim from Linear **Triage** (Sentry/intake) or **Duplicate**. Those are Linear-owned. A human accepts onto `Backlog`/`Parked` first.

An issue may **start** implement when status is `Implementing` and it has no branch/PR yet.

An issue may **resume** implement when status is `Implementing` **and** it already has a branch/PR (checker or land sent it back). Same issue, same branch, same PR. A new Cloud Agent VM — there is no resume of the previous session.

## Status map

Use the `states` array in factory config. Do not invent extra issue statuses.

Typical contract:

| State | Linear type | Who moves here | Meaning |
| --- | --- | --- | --- |
| Backlog | backlog | humans, `/to-tickets`, signal-up | Dispatch-eligible when `ready-for-agent` + unblocked |
| Parked | unstarted | humans only | Visible, never auto-dispatched |
| Triage | triage | Sentry and other intake | Inbox. Human accepts. Never auto-dispatch |
| Duplicate | duplicate | humans | Duplicate of another issue. Never auto-dispatch |
| Implementing | started | **planner** on claim; checker/land on fail | Coding in progress, including after review or merge failure |
| In Review | started | implementer when PR + proof exist on Linear | Checker owns the next step |
| Ready for merge | started | checker on pass | Waiting for the approver to read the GitHub PR |
| Done | completed | **approver only** after reading the PR | Human approval. Land merges to the integration lane |
| Canceled | canceled | humans | Dead. No agent action |

## Project + environment promotion

Issues belong to a Linear **project**. A **milestone** is a handful of vertical slices and the unit that promotes to staging.

| When | What happens |
| --- | --- |
| `/to-spec` kickoff | Create Linear project (`planned`) + milestones (each = one staging increment). No issues yet |
| `/to-spec` feature | Document on the existing project; new milestone only if this feature is its own staging increment |
| `/to-tickets` | Vertical-slice issues under **one** milestone each, dispatch state, **not** delegated |
| All issues on a **milestone** Done or Canceled | Staging automation opens/updates integration → staging PR for that increment |
| Staging green + approver asks for prod | Release helper diffs staging vs production, drafts release notes, opens staging → production PR. Approver merges production. |

Lanes come from `lanes` in factory config.

## Issue run (implement)

1. Status must already be `Implementing`. If it is `dispatch.state`, stop — planner has not claimed.
2. Fetch context: Linear `get_issue` **and** `list_comments`. `get_issue` does not include comments. The workpad is one comment (`agent.workpadHeading`). If a PR is linked, also read GitHub PR review comments.
3. On resume, the latest `### Review feedback` plus other issue/PR comments **are** the change request. Fix those before anything else. Same branch/PR.
4. Open or reuse the single workpad comment.
5. Start: branch from latest `origin/<lanes.integration>`. One issue, one branch, one PR. Resume: do not new-branch.
6. Follow `/implement`: `/tdd` at the spec’s seams; spawn **every matching helper** in `paths.helpers` (never their own Linear issues). Mobile/EAS slices also load `.cursor/skills/expo/` (`expo-overview` first, then the matching leaf).
7. Out of scope → `/signal-up`. Cap `agent.signalUpCapPerRun`. Never expand the PR.
8. Open or update a PR **into the integration lane**. Attach the PR URL on the issue.
9. Upload screenshots/recordings from the VM to the Linear issue. Comment. Link under workpad `### Evidence`.
10. Clear addressed `### Review feedback`. Move to `In Review`. Do not merge. Do not move to `Done`.

## Checker run

Wakes when status becomes `In Review`. Judge only. No feature coding.

1. `/code-review` (Standards + Spec) against the attached PR. Mobile/EAS diffs include `.cursor/skills/expo/` on the Standards axis.
2. GitHub CI/CD on that PR: read check runs / status checks. Pending → wait until they complete. Do not move status while checks are pending. Red or failed required checks → fail.
3. Pass only when both axes are clean **and** required GitHub checks are green → `Ready for merge`.
4. Fail → `Implementing` (same branch/PR) + workpad `### Review feedback` + Linear comment + attachments. That status change wakes implement. Do not start implement yourself.

## Land run (status became `Done`)

The approver moving the issue to `Done` **is** the merge approval. Merge into the integration lane only. Merge fail → `Implementing` and write the merge error under `### Review feedback`. Never force-push. Never land into staging or production from this run.

## Guardrails

- Never push directly to staging or production lanes.
- Never create Linear teams or workflow states at runtime (bootstrap skill only).
- Never delegate or self-apply dispatch on `signal-up` issues.
- Never validate your own code in the same context window.
- Secrets stay in env / GitHub Environments.

## Workpad template

````md
## Agent Workpad

```text
<lane>:<branch>@<short-sha>
```

### Plan

- [ ] 1. Parent
  - [ ] 1.1 Child

### Acceptance Criteria

- [ ] Criterion from the issue

### Validation

- [ ] targeted tests: `<command>`

### Domain helpers used

- (none | names of files spawned from paths.helpers)

### Notes

- timestamped progress

### Review feedback

- (none | why the last pass was not enough — checker, land, or approver)

### Evidence

- (none | Linear attachment titles / comment links for screenshots and recordings)

### Signal-up

- (none | <teamKey>-n …)
````
