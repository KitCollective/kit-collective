---
name: bootstrap-linear
description: Privileged Kit Collective Linear setup. Walks the human through creating the workspace, then runs the GraphQL bootstrap for team KIT, workflow states, and labels. Use when linear.setup.json is missing or the board is unshaped.
disable-model-invocation: true
---

# Bootstrap Linear

Official Linear MCP cannot create a workspace, team, or workflow states. This skill is the one-time privileged path. Runtime agents must not call `teamCreate` or `workflowStateCreate`.

## Human steps (block until done)

1. Create a Linear workspace named **Kit Collective** (API cannot).
2. Point Cursor’s Linear integration at that workspace — not Mercflow.
3. Enable the Cursor agent so issues can be **delegated**.
4. Put an admin API key in `.env` as `LINEAR_API_KEY` (never commit).
5. Confirm Linear tools in this chat report workspace **Kit Collective**.

If step 5 still shows Mercflow, stop.

## Script

```bash
set -a && source .env && set +a
node scripts/bootstrap-linear.mjs --dry-run
node scripts/bootstrap-linear.mjs
```

Idempotent. Writes `linear.setup.json`. Then wire automations from `docs/agents/automations.md`.
