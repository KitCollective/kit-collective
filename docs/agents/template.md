# Reuse this factory on a new repo

Copy these (generic):

- `factory.config.example.json` → `factory.config.json` (fill in)
- `WORKFLOW.md`
- `.cursor/skills/` (entire tree, including `_shared/`)
- `.cursor/rules/orchestration.mdc` and `scope-signal-up.mdc`
- `scripts/bootstrap-linear.mjs`
- `docs/agents/`
- `AGENTS.md` / `CONTEXT.md` — generate with `node scripts/generate-harness-docs.mjs`, then fill product **Language** in `CONTEXT.md`
- `.cursor/hooks.json` and `.cursor/hooks/`
- `.cursor/rules/project.mdc`

Replace per product:

- `.cursor/agents/` — domain helpers (this is the specialization)
- `.cursor/rules/` that encode stack/import laws
- `CONTEXT.md` / PRD / architecture under `paths.specs`

Then `/bootstrap-linear`. Live factory runtime is the PI worker (Compose + `gh` + Linear CLI); see `docs/agents/automations.md`. Cursor Cloud Agents are not dispatch.
