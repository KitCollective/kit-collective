# Issue tracker: Linear

Work for this repo lives in the Linear workspace named in `factory.config.json` (`product.name`, team `linear.teamKey`).

GitHub Issues are not the source of truth. GitHub holds PRs, CI, and Environments.

## After bootstrap

`scripts/bootstrap-linear.mjs` writes `paths.setupFile` (team / state / label IDs). Skills resolve statuses **by name** from factory config, and use the setup file when they need IDs.

If the setup file is missing, run `/bootstrap-linear`. Do not guess IDs.

## When a skill says "publish to the issue tracker"

| Skill | What to create |
| --- | --- |
| `/to-spec` kickoff | Linear **project** (`planned`) + **milestones** + a Linear document with the spec body. Issue label `kickoff`. Project labels `craft:*` as a PM filter. No issues. |
| `/to-spec` feature | Linear **document** on the existing project. Label `feature`. |
| `/to-tickets` | One Linear **issue** per vertical slice. Status = `dispatch.state`. Parent project + milestone. Native `blockedBy`. Label `ready-for-agent`. Optional `write-scope:`. **Do not delegate.** |
| `/signal-up` | New issue in the dispatch state with `signal-up` + `needs-triage`. Related to the origin. Never `Implementing`. |

## When a skill says "fetch the relevant ticket"

Use Linear MCP `get_issue` with `<teamKey>-n` or UUID **and** `list_comments` on the same issue. `get_issue` does not include comments. The workpad (`agent.workpadHeading`) is one of those comments; `### Review feedback` is the change request when work was sent back.

## Dispatch

Moving an issue to the dispatch state is **not** enough. A human must **delegate** it to `linear.delegateAgentName`. The human stays the assignee. Automations no-op when `blockedBy` is unresolved.

**Priority** is Linear’s native field (`0` None, `1` Urgent, `2` High, `3` Medium, `4` Low). The human sets it. Planner uses `dispatch.priorityOrder` only to pick **which eligible issue to claim next**. It does not replace delegate, blockers, or `signal-up`. `/to-tickets` does not invent a priority. Same rank: oldest first. Do not preempt `Implementing`.

## Intake (Linear Triage and Duplicate)

Team `linear.teamKey` keeps Linear’s **Triage** and **Duplicate** states. They are not in `factory.config.json` `states` (bootstrap must not rename or delete them). They are **not** the factory label group `Triage` / `needs-triage`.

- **Triage** — inbox for Sentry bugs and other integrations. Automations must not claim, label-as-ready, or delegate them.
- **Duplicate** — mark that the work already exists on another issue. No agent action.
- A human **Accepts** from Triage into `Parked` or `Backlog` (without delegate), or marks duplicate / declines / snoozes.
- After accept: add `needs-triage` until a human has shaped the ticket. Dispatch still requires `dispatch.state` + delegate + unblocked.

## PRs

Every implement run opens one PR into `lanes.integration`. Title starts with the issue id: `<teamKey>-12: …`.
