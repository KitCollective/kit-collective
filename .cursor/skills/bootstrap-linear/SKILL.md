---
name: bootstrap-linear
description: Privileged Linear setup. Walks the human through connecting the workspace named in factory.config.json, then runs the GraphQL bootstrap for team, workflow states, and labels. Use when linear.setup.json is missing or the board is unshaped.
disable-model-invocation: true
---

# Bootstrap Linear

Read [../_shared/factory.md](../_shared/factory.md). Official Linear MCP cannot create a workspace, team, or workflow states. Runtime agents must not call `teamCreate` or `workflowStateCreate`.

Human steps: [references/human.md](references/human.md). Then run `scripts/bootstrap-linear.mjs`. After Linear stamdata: `node scripts/generate-harness-docs.mjs` (writes `AGENTS.md` and the orchestration block in `CONTEXT.md`).
