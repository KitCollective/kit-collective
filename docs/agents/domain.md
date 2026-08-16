# Domain docs

How skills consume this repo’s domain documentation. Single-context (one `CONTEXT.md`).

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (or `CONTEXT-MAP.md` if this repo ever grows a second context)
- **`docs/adr/`** that touch the area you are about to work in
- **`factory.config.json`** then **`WORKFLOW.md`** before Linear or git lane work

If `CONTEXT.md` or `docs/adr/` is thin, proceed. `/grill-with-docs` creates terms and ADRs when they actually get resolved — not as an empty scaffold ritual.

## File jobs

| File | Job |
| --- | --- |
| `factory.config.json` | This product’s team, lanes, labels, approver. |
| `CONTEXT.md` | Shared vocabulary. Matt format: **Term** + `_Avoid_`. |
| `WORKFLOW.md` | Generic control-plane prompt. |
| `AGENTS.md` | Generated harness entrypoint. Do not edit by hand. |
| `docs/adr/` | Architecture Decision Records from `/grill-with-docs`. |
| `docs/design-system.md` | Visual and interaction lock from `/to-design`. Agents flag gaps; they do not invent taste. |
| `{paths.specs}/` | Product specs, PRD, architecture lock. |

When `/grill-with-docs` coins a term, add it to `CONTEXT.md` **Language** (never the generated Orchestration block). When it locks a decision, write an ADR under `docs/adr/`.

## Use the glossary’s vocabulary

When your output names a domain concept (issue title, test name, hypothesis), use the term as defined in `CONTEXT.md`. Don’t drift to synonyms the glossary lists under `_Avoid_`.

If the concept isn’t in the glossary yet, that’s a signal — either you’re inventing language, or there’s a real gap for `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it rather than silently overriding.
