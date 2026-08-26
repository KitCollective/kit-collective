# Issue tracker: Linear

Work for this repo lives in the Linear workspace named in `factory.config.json` (`product.name`, team `linear.teamKey`).

GitHub Issues are not the source of truth. GitHub holds PRs, CI, and Environments.

## After bootstrap

`scripts/bootstrap-linear.mjs` writes `paths.setupFile` (team / state / label IDs), including the `Merging` state id. Skills resolve statuses **by name** from factory config, and use the setup file when they need IDs.

If the setup file is missing, run `/bootstrap-linear`. Do not guess IDs.

## When a skill says "publish to the issue tracker"

| Skill | What to create |
| --- | --- |
| `/to-spec` kickoff | Linear **project** (`planned`) filled in: summary, description, lead (`approver`), `craft:*` project labels (PM filter). **Milestones** with descriptions. Linear **document** with the spec body. Priority and dates only if the conversation named them. No issues. |
| `/to-spec` feature | Linear **document** on the existing project. New **milestone** (with description) only if this feature is its own staging increment. Do not replace project labels. |
| `/to-tickets` | One Linear **issue** per vertical slice. Status = `dispatch.state`. Parent project + milestone. Native `blockedBy`. Label `ready-for-agent`. Optional `write-scope:`. **Do not delegate.** |
| `/signal-up` | New issue in Linear **Triage** with `signal-up` only (do not also apply `needs-triage` while the Triage group is exclusive). Related to the origin. Never `Implementing`. Never Backlog. |

## When a skill says "fetch the relevant ticket"

Use Linear `get_issue` with `<teamKey>-n` or UUID **and** `list_comments` on the same issue. On the PI worker that is Linear CLI (`gh` for GitHub). Desktop and Cloud Agent sessions may use Linear MCP; Linear MCP is not installed on kit-harness (empty `.pi/mcp.json`). `get_issue` does not include comments. The workpad (`agent.workpadHeading`) is one of those comments; `### Review feedback` is the change request when work was sent back.

## Dispatch

Moving an issue to the dispatch state is **not** enough. It needs label `ready-for-agent` (`dispatch.requireReadyForAgent`). The human stays the **assignee**. Never set Linear **Agent** to Cursor — that starts a Cloud Agent. Automations no-op when `blockedBy` is unresolved.

**Priority** is Linear’s native field (`0` None, `1` Urgent, `2` High, `3` Medium, `4` Low). The human sets it. `/to-spec` and `/to-tickets` copy it only when the conversation named it; they do not invent High to fill the UI. Planner claims **every** currently eligible issue in `dispatch.priorityOrder`. There is no concurrency cap — unresolved `blockedBy` is the limiter. Unset / None is last. Same rank: oldest first. Do not preempt `Implementing`.

## Intake (Linear Triage and Duplicate)

Team `linear.teamKey` keeps Linear’s **Triage** and **Duplicate** states. They are not in `factory.config.json` `states` (bootstrap must not rename or delete them). They are **not** the factory label group `Triage` / `needs-triage`.

- **Triage** — inbox for Sentry, `signal-up`, and `proposal`. Planner must not claim, label-as-ready, or delegate them.
- **Duplicate** — mark that the work already exists on another issue. No agent action.
- A human **Accepts** from Triage into `Parked` or `Backlog` (without `ready-for-agent`), or marks duplicate / declines / snoozes.
- After accept: add `needs-triage` until a human has shaped the ticket. Then `ready-for-agent`. Dispatch requires `dispatch.state` + `ready-for-agent` + unblocked. Never set Linear Agent to Cursor.

## PRs

Every implement run opens one PR into `lanes.integration`. Title starts with the issue id: `<teamKey>-12: …`.
