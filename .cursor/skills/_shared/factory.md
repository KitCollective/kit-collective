# Factory config (load first)

Every harness skill starts here.

1. Read `factory.config.json` at the repo root. That file is the only product-specific input. A new project copies `factory.config.example.json` → `factory.config.json` and fills it in.
2. Read `WORKFLOW.md` for the control-plane prompt (generic).
3. If `linear.setup.json` is missing, stop and run `/bootstrap-linear`.
4. Domain helpers live in `paths.helpers` (default `.cursor/agents/`). Spawn by matching the slice to each helper’s YAML `description`. They never own Linear issues. Skip `planner`, `checker`, and `release` during `/tdd`.

Working skills are `.cursor/skills/` — self-contained (Matt’s loop plus this factory). Do not recreate `.agents/`.

Vendored Expo/EAS skills live under `.cursor/skills/expo/`. They are not factory skills. `/implement`, `/tdd`, and checker load them on mobile and EAS slices. Product docs (`CONTEXT.md`, ADRs, `docs/design-system.md`, this helper layer) win on conflict.

Resolve names from config, not from memory:

| Need | Config path |
| --- | --- |
| Team key | `linear.teamKey` |
| Dispatch label | `ready-for-agent` |
| Approver | `approver` |
| Integration branch | `lanes.integration` |
| Dispatch state | `dispatch.state` |
| Claim order | `dispatch.priorityOrder` |
| Signal-up cap | `agent.signalUpCapPerRun` |
| Spec folder | `paths.specs` |
