# Human steps (block until done)

Values come from `factory.config.json`.

1. Create a Linear workspace named `product.name` (API cannot).
2. Point Cursor’s Linear integration at that workspace.
3. Enable the Cursor agent so issues can be **delegated** to `linear.delegateAgentName`.
4. Put an admin API key in `.env` as `LINEAR_API_KEY` (never commit).
5. Confirm Linear tools in this chat report workspace `product.name`.

If step 5 does not match `product.workspaceMatch`, stop.

```bash
set -a && source .env && set +a
node scripts/bootstrap-linear.mjs --dry-run
node scripts/bootstrap-linear.mjs
```

Idempotent. Writes `paths.setupFile`. Then:

```bash
node scripts/generate-harness-docs.mjs
```

That regenerates `AGENTS.md` and the orchestration section of `CONTEXT.md`. Product **Language** in `CONTEXT.md` is left alone.

Then wire automations from `docs/agents/automations.md`.
