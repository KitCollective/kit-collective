# KitCollective

Nordic football-shirt collector product. Use these terms in specs, tickets, commits, and Linear titles.

<!-- factory:generated-start -->
## Orchestration

Generated from `factory.config.json`. Do not put product nouns here.

**Control plane**:
Linear. Status + `ready-for-agent` + blockers decide what runs.
_Avoid_: GitHub Issues as source of truth, Linear Assignee → Agents → Cursor as dispatch

**Runtime**:
Cursor Automations + Cloud Agents reading this repo’s harness.
_Avoid_: Conductor board, local-only agents as the factory

**Kickoff**:
`/to-spec` for a new Linear project + milestones. No issues yet.
_Avoid_: creating tickets during spec

**Feature spec**:
`/to-spec` against an existing project.
_Avoid_: a second Linear project for the same effort

**Vertical slice**:
One issue that cuts schema → API → UI → tests and is demoable alone.
_Avoid_: horizontal tickets (schema-only, API-only)

**Dispatch**:
`Backlog` + label `ready-for-agent` + unblocked. Human remains assignee. Linear Agent stays empty (Cursor in that menu starts a Cloud Agent). Planner claim order = Linear priority (`dispatch.priorityOrder`).
_Avoid_: assigning Cursor as Agent or Assignee, treating priority as eligibility

**Workpad**:
The single workpad comment on an issue. `### Review feedback` is why a pass was sent back.
_Avoid_: a new comment thread per agent turn

**Signal-up**:
Out-of-scope bug or debt, filed as a new `Backlog` issue. Never coded in the current PR.
_Avoid_: expanding the PR, applying `ready-for-agent` to the finding

**Proposal**:
Out-of-scope feature or optimisation. Same ingress as signal-up, different label.
_Avoid_: mixing with `signal-up` on the same issue

**Land**:
Merge to `development` after Nicklas moves the issue to Done.
_Avoid_: landing to staging or production from an issue run

**Promotion**:
A Linear **milestone** complete → `staging`; release helper → `production`. Separate from land. Not the whole project at once.
_Avoid_: deploy, release PR as a synonym for land, treating the Linear project as one staging dump

**Triage** *(Linear state)*:
Inbox for Sentry and other intake. Human accepts onto the board. Never auto-dispatch.
_Avoid_: the Triage *label group*, `needs-triage`

**Duplicate** *(Linear state)*:
This work already exists on another issue. No agent action.
_Avoid_: deleting the issue instead of marking duplicate

**Write scope**:
Path globs on an implementation issue the implementer may change.
_Avoid_: treating surface labels as write scope
<!-- factory:generated-end -->

## Language

**Kit**:
Catalog truth for a shirt design (club / season / type). Not a user’s copy.
_Avoid_: shirt as catalog, jersey for the catalog row

**UserJersey**:
A collector’s owned instance of a Kit, with photos and personal fields.
_Avoid_: Kit (for a copy), collection item

**CatalogLabel**:
Locale + kind name for stamdata. The English seed string is not the Danish UI name.
_Avoid_: hardcoding English as the UI label

**Vision suggestion**:
Gemini output. Persist catalog UUIDs after confirm.
_Avoid_: raw model names as foreign keys

**Save**:
Must not wait on Vision, kit completeness, or manufacturer.
_Avoid_: blocking save on inference

**Lane**:
One of `development`, `staging`, `production` — git branch, GitHub Environment, and EAS channel. Same names, different objects.
_Avoid_: environment as a synonym without saying which object
