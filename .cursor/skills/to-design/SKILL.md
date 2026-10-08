---
name: to-design
description: Human-in-the-loop interview that locks visual and interaction rules into an AI-ready design-system Markdown file.
disable-model-invocation: true
---

# To design

Load `factory.config.json` then `WORKFLOW.md`. Read [../_shared/factory.md](../_shared/factory.md). Read `CONTEXT.md` and `docs/design-system.md` if they exist.

This skill interviews the human until visual and interaction decisions are **AI-ready**: explicit enough that people, implementation, AI, and accessibility share them. It writes `docs/design-system.md`. Implementing agents follow that file; they **flag** gaps instead of inventing taste.

The loop follows the [AI-ready Design System Roadmap](https://designsystems.surf): **Define** then **Create**. **Adopt** and **Evolve** wait for a later **Gap** pass. **Clarity first**: lock meaning, usage, relationships, and constraints for what current screens need. Coverage without those four is guesswork with extra files.

Do not invent Linear statuses. Do not publish tickets or open a PR. Next slash is `/to-spec` when the product spec is still open; otherwise implementing agents just read the file.

## Factory twist

- Surfaces come from `labels.surfaces` in factory config. Do not invent a surface.
- `docs/design-system.md` is the visual lock. Domain nouns stay in `CONTEXT.md`. Offer an ADR under `docs/adr/` only when `/grill-with-docs`’s three tests all hold (hard to reverse, surprising without context, a real trade-off).
- Distinct from `/codebase-design` (code modules) and `/prototype` (throwaway to *see* a look). A question that needs a look is a `/prototype` detour — tell the human to type it; fold the verdict back here.
- The Frontend Role in `paths.helpers` applies this lock during `/implement`. This skill authors the lock; it does not implement screens.
- Interview in the user’s language. Write `docs/design-system.md` in English.
- Clients must not import `apps/api` or `packages/db`. The lock talks in tokens, components, and surfaces.
- Never `/land` or push `lanes.staging` / `lanes.production`.

## Mode

Ask once if unclear:

| Mode | When | Work |
| --- | --- | --- |
| **Lock** | No `docs/design-system.md`, or it cannot guide a screen | Define + Create for in-scope surfaces. Skip Adopt and Evolve. |
| **Gap** | The file exists; agents still guess | Assess the twenty areas in [references/ROADMAP.md](references/ROADMAP.md). Pick the 3–5 gaps that block current work. Fill only those. |

## Process

### 1. Ground

Read `CONTEXT.md`, existing `docs/design-system.md`, `docs/adr/`, `{paths.specs}/Architecture/`, and the host apps for in-scope surfaces. Separate what already exists in code (tokens, components, layout primitives) from what lives only in someone’s head.

Load [references/ROADMAP.md](references/ROADMAP.md). Mark each area **locked**, **thin**, or **missing**. In **Lock** mode, the run’s areas are Define + Create. In **Gap** mode, name the 3–5 areas and why they matter now.

**Done when:** you can name the surfaces in scope, the current source of truth for visual decisions (file, code, or none), and which roadmap areas this run will touch.

### 2. Taste and Define

Work a **frontier** in rounds — same shape as `/grill-with-docs`. Number every question; give a recommended answer; then wait.

```text
❓ **Q1** - **<title>**: <body, choices if any>

➡️ <your recommended answer>
```

Facts are your job (read the repo). Decisions are the user’s.

First round locks **taste** so later rounds have a north star: feel in a few words, north-star products, anti-references (what this is not), density, motion, contrast, platform feel (native vs branded), shipped color modes, accessibility floor (contrast, hit targets, reduced motion).

Then lock Define, in order, using the checkpoints in [references/ROADMAP.md](references/ROADMAP.md):

1. **Goals** — problem, audience, outcomes. Not “a component library”.
2. **Principles** — few, distinct, with an explicit trade-off when they collide, plus one follow and one violate example each.
3. **Scope** — included surfaces and depth; exclusions and deferred work with reasons.
4. **Architecture** — layers (foundations → tokens → components → patterns), naming, source of truth per decision type.
5. **Ownership** — who decides visual changes (usually `approver`). Route; do not assign new authority.

A question that needs a look → stop and tell the human to run `/prototype`, then continue.

**Done when:** the human has confirmed goals, principles, scope, layers, and ownership, and each principle can decide a real trade-off.

### 3. Create

Lock Create areas in order. After each area is confirmed, write it into `docs/design-system.md` using [references/DESIGN-MD.md](references/DESIGN-MD.md). Do not wait until the end.

- **Foundations** — [references/FOUNDATIONS.md](references/FOUNDATIONS.md). Meaning, usage, relationships, constraints. Recommend concrete values; the human accepts or overrides.
- **Tokens** — layers (primitive → semantic), naming that encodes purpose, references, modes. Later work selects existing tokens.
- **Components** — [references/COMPONENTS.md](references/COMPONENTS.md). Inventory first; depth second. For each in-scope primitive: purpose, anatomy, API, states, accessibility, composition, unsupported uses. Copy the contract shape, not the example values, unless the human chose them.
- **Design–code alignment** — map each locked token and component to the host implementation on each in-scope surface. Record supported exceptions (platform differences) with reasons.
- **Documentation** — the MD is the guidance. Every locked decision has purpose, usage, constraints, an example labeled *example* (not a new rule), and exceptions.

**Done when:** a new screen on an in-scope surface can be composed from locked foundations, tokens, and components, and the MD tells an agent what to flag when coverage is missing.

### 4. AI-ready check

For every area this run locked, the MD must contain what AI must know for that area ([references/ROADMAP.md](references/ROADMAP.md)). Run one readiness test per locked area against the MD. Reliable output uses stated rules, explains the trade-off, and flags gaps. If the test invents a value, token, variant, or rule, that section is thin — tighten it with the human, then re-test.

Every section of the MD ends with the contract: **flag missing context; do not invent values, tokens, variants, or rules.**

**Done when:** each locked area passes its readiness test, and the human confirms the file.

## Output

Write only `docs/design-system.md` (create or update). Match [references/DESIGN-MD.md](references/DESIGN-MD.md). Keep examples in the MD labeled as examples.

Tell the human the path, which areas are locked vs deferred, and the next slash: `/to-spec` if the product spec is still open; otherwise implementing agents read the file.
