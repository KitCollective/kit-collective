---
name: improve-codebase-architecture
description: Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick.
disable-model-invocation: true
---

# Improve Codebase Architecture

Load `factory.config.json` then `WORKFLOW.md`. Read [../_shared/factory.md](../_shared/factory.md). Read `CONTEXT.md` and ADRs in the area you're touching.

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

This is a **survey**, not a rescue, and not an implement run. Picking a candidate *generates an idea* you take into the main flow.

## Factory twist

- Vocabulary from `/codebase-design` (`module`, `interface`, `depth`, `seam`, `adapter`, `leverage`, `locality`). Read that skill; do not substitute “component,” “service,” “API,” or “boundary.”
- `grilling` and `domain-modeling` are inlined in `/grill-with-docs`. This skill **inlines the interview** after the user picks — do not tell them to type `/grill-with-docs` mid-loop, and do not fire that user-invoked skill.
- Specs and deepenings may not fight `{paths.specs}/Architecture/`. If the winner fights the lock, change the lock first (ADR), then the spec.
- Clients (`apps/mobile`, `apps/web`, `apps/admin`) must not import `apps/api` or `packages/db`. A seam that would require that is the wrong seam.
- Do **not** write product code, open a PR, move Linear, or land. After shared understanding: `/to-spec` in the **same** conversation if they want to build it. Out of a current issue → `proposal` + `needs-triage`, never auto-delegate.
- Report HTML goes in the OS temp directory. Nothing from this skill lands in the repo except `CONTEXT.md` Language terms and ADRs the user accepted.

## Vocabulary

This command is _informed_ by the project's domain model and built on a shared design vocabulary:

- Read `.cursor/skills/codebase-design/SKILL.md` for the architecture vocabulary and its principles (the deletion test, "the interface is the test surface", "one adapter = hypothetical seam, two = real"). Use these terms exactly in every suggestion.
- The domain language in `CONTEXT.md` gives names to good seams; ADRs in `docs/adr/` record decisions this command should not re-litigate.

## Process

### 1. Explore

**Scope before you scan — YAGNI.** Deepening a module pays off by making future changes to it easier, so put extra weight on the parts of the codebase that have recently changed. Decide *where* to look before you look:

- If the user named a direction — a module, a subsystem, a pain point — take it, and skip the inference below.
- Otherwise, walk back a good stretch of the commit history (`git log --oneline`) to find the codebase's hot spots — the files and areas that keep coming up — and let those paths pull your attention first. If the changes are scattered with no clear hot spot, widen the net.

Read the project's domain glossary (`CONTEXT.md`) and any ADRs in the area you're touching first.

Then spawn a sub-agent to walk the codebase. Don't follow rigid heuristics — explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present candidates as an HTML report

Write a self-contained HTML file to the OS temp directory so nothing lands in the repo. Resolve the temp dir from `$TMPDIR`, falling back to `/tmp` (or `%TEMP%` on Windows), and write to `<tmpdir>/architecture-review-<timestamp>.html` so each run gets a fresh file. Open it for the user — `xdg-open <path>` on Linux, `open <path>` on macOS, `start <path>` on Windows — and tell them the absolute path.

The report uses **Tailwind via CDN** for layout and styling, and **Mermaid via CDN** for diagrams where a graph/flow/sequence reliably communicates the structure. Mix Mermaid with hand-crafted CSS/SVG visuals — use Mermaid when relationships are graph-shaped (call graphs, dependencies, sequences), and hand-built divs/SVG when you want something more editorial (mass diagrams, cross-sections, collapse animations). Each candidate gets a **before/after visualisation**. Be visual.

For each candidate, render a card with:

- **Files** — which files/modules are involved
- **Problem** — why the current architecture is causing friction
- **Solution** — plain English description of what would change
- **Benefits** — explained in terms of locality and leverage, and how tests would improve
- **Before / After diagram** — side-by-side, custom-drawn, illustrating the shallowness and the deepening
- **Recommendation strength** — one of `Strong`, `Worth exploring`, `Speculative`, rendered as a badge

End the report with a **Top recommendation** section: which candidate you'd tackle first and why.

**Use CONTEXT.md vocabulary for the domain, and the `/codebase-design` vocabulary for the architecture.** If `CONTEXT.md` defines "Order," talk about "the Order intake module" — not "the FooBarHandler," and not "the Order service."

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly in the card (e.g. a warning callout: _"contradicts ADR-0007 — but worth reopening because…"_). Don't list every theoretical refactor an ADR forbids.

See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance.

Do NOT propose interfaces yet. After the file is written, ask the user: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, interview until you share one understanding. Map a **design tree**: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait.

```text
❓ **Q1** - **<title>**: <body, choices if any>

➡️ <your recommended answer>
```

Facts are your job (read the repo). Decisions are the user’s.

Side effects happen inline as decisions crystallize:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md` **Language** immediately. Never edit the generated Orchestration block.
- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md` right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR under `docs/adr/` only when all three are true: hard to reverse, surprising without context, real trade-off. Frame as: _"Want me to record this as an ADR so future architecture reviews don't re-suggest it?"_ Skip ephemeral reasons ("not worth it right now") and self-evident ones.
- **Want to explore alternative interfaces for the deepened module?** Read `.cursor/skills/codebase-design/DESIGN-IT-TWICE.md` and run that parallel sub-agent pattern. Human session only.

Done when the frontier is empty. Do not run `/to-spec` until the user confirms shared understanding. Then, if they want it built, `/to-spec` **feature** in this conversation (existing Linear project). This skill does not publish tickets.
