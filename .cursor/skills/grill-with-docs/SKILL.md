---
name: grill-with-docs
description: Relentless interview that writes CONTEXT.md terms and ADRs. Use in this repo before /to-spec — for a whole-product kickoff or a single new feature. Not grill-me (that skill writes no files).
disable-model-invocation: true
---

# Grill with docs

Load `factory.config.json` then `WORKFLOW.md`. Read `CONTEXT.md` first.

This is Matt’s `/grill-with-docs`, not `/grill-me`. `/grill-me` is stateless (no repo, no files, not necessarily code). We always have a repo, so we grill **and** write the glossary.

Do not invent Linear statuses. Do not publish tickets. Next step is `/to-spec` in the **same** conversation.

## Which tree you are grilling

Ask once, then grill that tree:

| Mode | When | Tree |
| --- | --- | --- |
| **Kickoff** | New product, or the repo has no Linear project for this effort | The product. Outcome is a shared language plus a map `/to-spec` will turn into one Linear **project** and several **milestones** (each milestone = one staging increment). |
| **Feature** | Product already specified; this is a new slice on an existing Linear project | That change only. Do not re-litigate the whole product. Outcome is terms/ADRs for this change; `/to-spec` attaches a document (and maybe one new milestone) on the existing project. |

An effort too big for one sitting is still this skill, in rounds — not `/grill-me`, not a second tracker. Linear project + milestones **are** the map.

## Interview (grilling)

Interview until you share one understanding. Map a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait.

```text
❓ **Q1** - **<title>**: <body, choices if any>

➡️ <your recommended answer>
```

Facts are your job (read the repo). Decisions are the user’s. A running exploration is an unsettled prerequisite — ask the rest of the frontier now.

Done when the frontier is empty. Do not run `/to-spec` until the user confirms shared understanding.

A question that needs a runnable answer (state, a UI you have to see) is a **`/prototype`** detour — then back here. Reading you don’t want in this window is **`/research`**.

## Domain model (write as you go)

Challenge terms against `CONTEXT.md`. Propose canonical words for overloaded ones. Stress-test with concrete scenarios. If the user states how something works, check the code.

When a **term** resolves, add it to `CONTEXT.md` **Language** immediately (Matt format in [references/CONTEXT-FORMAT.md](references/CONTEXT-FORMAT.md)). Never edit the generated Orchestration block. Glossary only — no spec prose.

Offer an **ADR** under `docs/adr/` only when all three are true (see [references/ADR-FORMAT.md](references/ADR-FORMAT.md)):

1. Hard to reverse
2. Surprising without context
3. A real trade-off

Most sessions produce few or no ADRs. That is correct. Everything else lives in this conversation for `/to-spec`.
