# Kit Collective — domain language

Use these terms in specs, tickets, commits, and Linear titles. Prefer one word over a paragraph.

## Product

| Term | Meaning |
| --- | --- |
| Kit | Catalog truth for a shirt design (club / season / type). Not a user’s copy. |
| UserJersey | A collector’s owned instance of a Kit, with photos and personal fields. |
| CatalogLabel | Locale + kind name for stamdata. English seed string is not the Danish UI name. |
| Vision suggestion | Gemini output. Persist catalog UUIDs after confirm — never raw model names as FK. |
| Save | Must not wait on Vision, kit completeness, or manufacturer. |
| Lane | One of `development`, `staging`, `production` — git branch, GitHub Environment, and EAS channel. Same names, different objects. |

Full product glossary grows via `/grill-with-docs` into this file and `docs/adr/`.

## Orchestration

| Term | Meaning |
| --- | --- |
| Control plane | Linear. Status + delegate + blockers decide what runs. |
| Runtime | Cursor Automations + Cloud Agents reading this repo’s harness. |
| Kickoff | `/to-spec` for a new Linear project + milestones. No issues yet. |
| Feature spec | `/to-spec` against an existing project. |
| Vertical slice | One issue that cuts schema → API → UI → tests and is demoable alone. |
| Delegate | Linear agent field. Human remains assignee. Dispatch key with `Backlog` + unblocked. |
| Workpad | The single `## Agent Workpad` comment on an issue. |
| Signal-up | Out-of-scope finding filed as a new `Backlog` issue. Never coded in the current PR. |
| Land | Merge to `development` after Nick moves the issue to `Done`. |
| Promotion | Project-complete → staging; release agent → production. Separate from land. |
