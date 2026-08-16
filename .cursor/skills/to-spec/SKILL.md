---
name: to-spec
description: Turn the current conversation into a spec. Kickoff publishes a Linear project + milestones; feature publishes a document on an existing project. Use after grilling.
disable-model-invocation: true
---

# To spec

Load `factory.config.json` then `WORKFLOW.md`. Resolve names from [../_shared/factory.md](../_shared/factory.md). If `linear.setup.json` is missing, stop and run `/bootstrap-linear`.

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user — just synthesize what you already know.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Use `/codebase-design` vocabulary (module, interface, seam, adapter). Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations. Those seams become Testing Decisions — `/implement` and `/tdd` will not re-quiz them.

3. Write the spec using the template below, then publish it. Next step is `/to-tickets`. Do not publish Linear **issues** from this skill. Do not delegate. Do not open a PR.

Write the spec to `{paths.specs}/<slug>/spec.md` as well as Linear.

Choose a **mode**. Ask if unclear.

### Kickoff

No Linear project exists for this effort (new product, or unscaffolded repo). The spec must organize the **whole picture**, not one flat feature:

- One Linear **project** (`save_project` on `linear.teamKey`, status `planned`)
- Several **milestones** — each is a shippable increment, a **handful of vertical slices**, and the unit that later promotes `lanes.integration` → `lanes.staging`. Not tasks. Not “phase 1 / phase 2” as wishful labels; each milestone has a demoable “complete”.
- `save_document` on that project with the spec body
- Label `kickoff`

Add `## Linear` (project name, each milestone, what complete means). Keep the other headings.

### Feature

A Linear project already exists. This is a new slice on a specified product.

- `save_document` on that project only
- Label `feature` (Linear Type **Feature**)
- Do **not** create a second project
- If this feature is its own staging increment, `save_milestone` on the existing project. If it belongs in an open milestone, attach there.

If unclear, ask which Linear project (and milestone) this belongs to.

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Which **seams** `/tdd` will use (highest public interface; prefer existing)
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Linear

- **Project:** name
- **Mode:** kickoff | feature
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Milestone name — what “complete” means (demoable; ready to promote integration → staging)

## Further Notes

Any further notes about the feature.

</spec-template>
