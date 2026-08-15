# Issue tracker: Linear

Work for this repo lives in the **Kit Collective** Linear workspace, team key `KIT`.

GitHub Issues are not the source of truth. GitHub holds PRs, CI, and Environments.

## After bootstrap

`scripts/bootstrap-linear.mjs` writes `linear.setup.json` (team / state / label IDs). Skills and automations resolve statuses **by name** from `WORKFLOW.md`, and use the setup file when they need IDs.

If `linear.setup.json` is missing, run `/bootstrap-linear`. Do not guess IDs.

## When a skill says "publish to the issue tracker"

| Skill | What to create |
| --- | --- |
| `/to-spec` kickoff | Linear **project** (`planned`) + **milestones** + a Linear document with the spec body. Label `kickoff`. No issues. |
| `/to-spec` feature | Linear **document** on the existing project. Label `feature`. |
| `/to-tickets` | One Linear **issue** per vertical slice. Status `Backlog`. Parent project + milestone. Native `blockedBy` links. Label `ready-for-agent`. **Do not delegate.** |
| `/signal-up` | New issue in `Backlog` with `signal-up` + `needs-triage`. Related to the origin issue. Never `Implementing`. |

Issue bodies use the ticket template in the `to-tickets` skill (what to build, acceptance criteria, blocked by). Do not put file paths that will go stale.

## When a skill says "fetch the relevant ticket"

Use Linear MCP `get_issue` with the identifier (`KIT-12`) or UUID. Also read the `## Agent Workpad` comment if present.

## Dispatch

Moving an issue to `Backlog` is **not** enough. A human must **delegate** it to the Cursor agent. The human stays the assignee. Automations no-op when `blockedBy` is unresolved.

## Wayfinding operations

`/wayfinder` maps (if used) are Linear issues labelled `wayfinder:map`. Child tickets are issues in the same project with native blocking. Prefer `/to-spec` + `/to-tickets` for product work; wayfinder is for foggy decisions, not implementation slices.

## PRs

Every implement run opens one PR into `development` and attaches the URL on the Linear issue. The PR title starts with the issue id: `KIT-12: …`.
