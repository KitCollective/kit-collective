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
| `/signal-up` | New issue in Linear **Triage** with `signal-up` only (do not also apply `needs-triage` while the Triage group is exclusive). Related to the origin. Never `In Progress`. Never Backlog. |

## When a skill says "fetch the relevant ticket"

Use Linear `get_issue` with `<teamKey>-n` or UUID **and** `list_comments` on the same issue. On the PI worker that is Linear CLI (`gh` for GitHub). Desktop and Cloud Agent sessions may use Linear MCP **when it is connected to the workspace in `factory.config.json`**; a Linear MCP pointing at another workspace returns “not found” for every `KIT-n`, so check the workspace before trusting it. Claude Code sessions (and any session without the right MCP) use `node scripts/linear.mjs` instead: `issue KIT-n` returns the issue with labels, `blockedBy` and all comments in one call, and `comment`, `comment-update`, `state`, `label`, `description` and `link` cover the factory transitions. `list` and `create` below find and file issues. The script reads `LINEAR_API_KEY` from the environment or from the main checkout's gitignored `.env` (it resolves the main checkout from an issue worktree) and never prints it — do not read `.env` yourself. `get_issue` does not include comments. The workpad (`agent.workpadHeading`) is one of those comments; `### Review feedback` is the change request when work was sent back.

## Finding and creating issues with `linear.mjs`

`node scripts/linear.mjs list [--state <name>[,<name>]] [--label <name>] [--no-label <name>] [--project <name>] [--limit n] [--unblocked]` prints one JSON array (default limit 50, max 250) of `{ identifier, title, state, labels, blockedBy, writeScope, project, url }`. `blockedBy` holds open blockers only; a blocker is resolved in Done, Canceled, Duplicate or Post-Merge. `writeScope` is the parsed `write-scope:` globs, or `null`. An unknown state or label is an error that names the valid ones. Read-only. The dispatch query is:

```bash
node scripts/linear.mjs list --state To-do --label ready-for-agent --unblocked
```

`node scripts/linear.mjs create "<title>" --body-file <path> [--state <name>] [--label <name>]... [--project <name>] [--parent KIT-n] [--blocked-by KIT-n]...` creates an issue on the KIT team and prints `KIT-n <url>`. The default state is Backlog. Guardrails: the labels `signal-up` and `proposal` are refused (they have `signal-up` and the proposal flow, with their own caps and Triage rules); `ready-for-agent` is allowed only with state To-do or Backlog and only when the body has a non-empty `write-scope:` line and an `## Acceptance criteria` section with at least one `- [ ]` item; two labels from the same exclusive group are refused; an empty or missing body file is refused. `--blocked-by` creates the same blocking relation as `block`.

## Dispatch

Moving an issue to the dispatch state is **not** enough. It needs label `ready-for-agent` (`dispatch.requireReadyForAgent`). The human stays the **assignee**. Never set Linear **Agent** to Cursor — that starts a Cloud Agent. Automations no-op when `blockedBy` is unresolved.

**Priority** is Linear’s native field (`0` None, `1` Urgent, `2` High, `3` Medium, `4` Low). The human sets it. `/to-spec` and `/to-tickets` copy it only when the conversation named it; they do not invent High to fill the UI. Planner claims **every** currently eligible issue in `dispatch.priorityOrder`. There is no concurrency cap — unresolved `blockedBy` is the limiter. Unset / None is last. Same rank: oldest first. Do not preempt `In Progress`.

## Intake (Linear Triage and Duplicate)

Team `linear.teamKey` keeps Linear’s **Triage** and **Duplicate** states. They are not in `factory.config.json` `states` (bootstrap must not rename or delete them). They are **not** the factory label group `Triage` / `needs-triage`.

- **Triage** — inbox for Sentry, `signal-up`, and `proposal`. Planner must not claim, label-as-ready, or delegate them.
- **Duplicate** — mark that the work already exists on another issue. No agent action.
- `Approval` is cross-stage: a human is needed (a question, a decision, a plan, or the merge). The human answers in a comment and moves the issue to `To-do` (any answer goes back to `To-do`), or to `Merging` to approve the merge. `Blocked` is for started work that needs another issue first and requires an unresolved `blockedBy` (`node scripts/linear.mjs block <KIT-n> --by <KIT-m>`). The owner defers work by moving it to `Backlog`.
- A human **Accepts** from Triage into `Backlog` or `To-do` (`To-do` only once shaped, with `ready-for-agent`), or marks duplicate / declines / snoozes.
- After accept: add `needs-triage` until a human has shaped the ticket. Then `ready-for-agent`. Dispatch requires `dispatch.state` + `ready-for-agent` + unblocked. Never set Linear Agent to Cursor.

## PRs

Every implement run opens one PR into `lanes.integration`. Title starts with the issue id: `<teamKey>-12: …`.
