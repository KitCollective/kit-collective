# KitCollective

Nordic football-shirt collector product, plus the agent factory that builds it.

Product truth: `.scratch/Business/PRD.md`  
Stack lock: `.scratch/Architecture/tech-stack.md`  
Control plane: [`WORKFLOW.md`](./WORKFLOW.md) + [`factory.config.json`](./factory.config.json)

## Factory (Linear + Cursor)

Linear is the board. Cursor Cloud Agents execute. Config is `factory.config.json` (copy `factory.config.example.json` on a new repo). See `docs/agents/template.md`.

1. Create a Linear workspace named in `product.name` (API cannot do this).
2. Connect Cursor’s Linear integration to that workspace.
3. Connect Cursor’s Linear integration (Automations status triggers). Do **not** dispatch by setting Assignee → Agents → Cursor.
4. Put an admin Linear API key in `.env` as `LINEAR_API_KEY` (see `.env.example`).
5. Run bootstrap:

```bash
set -a && source .env && set +a
node scripts/bootstrap-linear.mjs --dry-run
node scripts/bootstrap-linear.mjs
node scripts/generate-harness-docs.mjs
```

6. Wire Cursor Automations from `docs/agents/automations.md`. Re-paste planner Instruction after contract changes.

Then: `/grill-with-docs` → `/to-spec` → `/to-tickets` → planner claims (`ready-for-agent` + unblocked).

Working skills: `.cursor/skills/` (Expo/EAS vendor pack: `.cursor/skills/expo/`). Domain helpers: `.cursor/agents/`.

## Dispatch

An issue runs only when it is in `dispatch.state`, labelled **`ready-for-agent`**, and not blocked. Linear Agent stays empty. Among those, planner claims in Linear priority order (`dispatch.priorityOrder`).

## Lanes

`lanes.integration` → `lanes.staging` → `lanes.production`. Issue land merges to the integration lane only, after the approver moves the issue to `Done`.
