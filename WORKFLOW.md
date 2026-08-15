---
tracker:
  kind: linear
  team_key: KIT
  setup_file: linear.setup.json
  default_branch: development
  promotion_branches:
    - development
    - staging
    - production
  dispatch:
    state: Backlog
    require_delegate: true
    require_unblocked: true
  active_states:
    - Implementing
    - In Review
    - Ready for merge
    - Rework
  handoff_states:
    - Ready for merge
  land_state: Done
  terminal_states:
    - Done
    - Canceled
  parked_state: Parked
  project_statuses:
    specced: planned
    building: started
    staging: completed
agent:
  max_concurrent: 3
  signal_up_cap_per_run: 3
  workpad_heading: "## Agent Workpad"
---

# Kit Collective agent workflow

Linear is the control plane. Cursor Automations + Cloud Agents are the runtime.
This file is the contract. Automations must follow it, not a one-off prompt.

Skills: Matt Pocock originals in `.agents/skills/` (do not edit). Harness twists in `.cursor/skills/` wrap those originals, then apply this file. Factory runs use the Cursor skills.

You are working on Linear issue `{{ issue.identifier }}`.

## Eligibility (dispatch)

An issue may start an implement run **only** when all of these are true:

1. Status is `Backlog`
2. It is **delegated** to the Cursor agent (Linear agent field — the human stays assignee)
3. It has **no** unresolved `blockedBy` relations
4. No other agent run is already claimed on it (status is still `Backlog`)

If any check fails: **do not modify the issue**. Stop.

On claim: move to `Implementing` **before** any code change.

## Status map

| State | Linear type | Who moves here | Meaning |
| --- | --- | --- | --- |
| Backlog | backlog | humans, `/to-tickets`, signal-up | Queued. Dispatch-eligible when delegated + unblocked |
| Parked | unstarted | humans only | Visible, never auto-dispatched |
| Implementing | started | implement automation on claim | Coding in progress |
| In Review | started | implementer when PR + proof exist | Autonomous checker owns the next step |
| Ready for merge | started | checker on pass | Waiting for Nick to read the GitHub PR |
| Rework | started | checker or Nick | Changes requested; implementer resumes |
| Done | completed | **Nick only** after reading the PR | Human approval. Land automation merges to `development` |
| Canceled | canceled | humans | Dead. No agent action |

Do not invent extra issue statuses.

## Project + environment promotion

Issues belong to a Linear **project**. Milestones group shippable increments inside that project.

| When | What happens |
| --- | --- |
| `/to-spec` kickoff | Create Linear project (`planned`) + milestones. No issues yet |
| `/to-tickets` | Vertical-slice issues under those milestones, status `Backlog`, **not** delegated |
| All project issues `Done` or `Canceled` | Staging automation opens/updates the `development` → `staging` promotion PR and runs staging CI |
| Staging green + Nick asks for prod | Release agent diffs `staging` vs `production`, writes Linear release notes + changelog, opens `staging` → `production` PR. Nick approves. Agent does not push production without that approval |

Git lanes are `development` / `staging` / `production` (see `.scratch/Architecture/tech-stack.md` §10).

## Issue run (implement)

1. Re-check eligibility. Claim → `Implementing`.
2. Open or reuse the single workpad comment whose heading is `## Agent Workpad`.
3. Branch from latest `origin/development`. One issue, one branch, one PR.
4. Follow `/implement`: `/tdd` at the spec’s seams; spawn **domain helper sub-agents** (never their own Linear issues).
5. Out of scope → `/signal-up`. Cap 3. Never expand the PR.
6. Open a PR **into `development`**. Link the Linear issue. Attach the PR URL on the issue.
7. Only then move to `In Review`.

## Checker run (PR opened or `In Review`)

Judge only. No feature coding.

1. Resolve the Linear issue from the PR.
2. Run `/code-review` (Standards + Spec) as parallel sub-agents.
3. Pass + CI green → `Ready for merge`.
4. Fail → `Rework` with findings in the workpad. Do not merge.

## Land run (status became `Done`)

Nick moving the issue to `Done` **is** the merge approval.

1. Confirm the linked PR targets `development`, checker passed, CI green.
2. Merge the PR (`gh pr merge`, squash or merge per repo default).
3. If merge fails: move to `Rework`, explain in the workpad. Never force-push `development`.

## Guardrails

- Never push directly to `staging` or `production`.
- Never merge to `production` from an issue land run.
- Never create Linear teams or workflow states at runtime (bootstrap script only).
- Never delegate or self-apply dispatch on `signal-up` issues.
- Never validate your own code in the same context window — checker is a separate run.
- Secrets stay in env / GitHub Environments. Never log them.
- Product clients must not import `apps/api` or `packages/db`.

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

- (none | ui-ux / react-expo / backend-nest / db-drizzle / devops)

### Notes

- timestamped progress

### Signal-up

- (none | KIT-xx …)
````
