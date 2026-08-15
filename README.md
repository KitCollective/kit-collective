# KitCollective

Nordic football-shirt collector product, plus the agent factory that builds it.

Product truth: `.scratch/Business/PRD.md`  
Stack lock: `.scratch/Architecture/tech-stack.md`  
Control plane: [`WORKFLOW.md`](./WORKFLOW.md)

## Factory (Linear + Cursor)

Linear is the board. Cursor Cloud Agents execute. You stay in the helicopter.

1. Create a Linear workspace named **Kit Collective** (API cannot do this).
2. Connect Cursor’s Linear integration to that workspace (not Mercflow).
3. Enable the Cursor agent so issues can be **delegated**.
4. Put an admin Linear API key in `.env` as `LINEAR_API_KEY` (see `.env.example`).
5. Run bootstrap:

```bash
set -a && source .env && set +a
node scripts/bootstrap-linear.mjs --dry-run
node scripts/bootstrap-linear.mjs
```

6. Wire Cursor Automations from `docs/agents/automations.md`.

Then: `/grill-with-docs` → `/to-spec` (project + milestones) → `/to-tickets` (Backlog issues) → delegate to Cursor.

Matt Pocock originals live in `.agents/skills/` (do not edit). Harness twists live in `.cursor/skills/`.

## Dispatch rule

An issue runs only when it is `Backlog`, **delegated** to Cursor, and not blocked. Labels like `ready-for-agent` mean the ticket is well-written — they do not start a run.

## Lanes

`development` → `staging` → `production`. Issue land merges to `development` only, after you move the issue to `Done`.
