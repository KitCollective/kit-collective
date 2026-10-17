---
name: to-spec
description: Turn the current conversation into a spec. Kickoff publishes a Linear project + milestones; feature publishes a document on an existing project. Drafts the Scenarios of each app milestone and pushes the approved ones to the Holdout; an Optio milestone records its demo and live checks instead. Use after grilling.
disable-model-invocation: true
---

# To spec

Load `factory.config.json` then `WORKFLOW.md`. Resolve names from [../_shared/factory.md](../_shared/factory.md). If `linear.setup.json` is missing, stop and run `/bootstrap-linear`.

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user — just synthesize what you already know.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Use `/codebase-design` vocabulary (module, interface, seam, adapter). Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations. Those seams become Testing Decisions — `/implement` and `/tdd` will not re-quiz them.

3. **Draft the spec, unpublished.** Write the spec and its milestones with the template below to `{paths.specs}/<slug>/spec.md` only. Publish nothing to Linear yet.

4. **Scenarios (fixed step, on the drafted milestones).** Draft the Scenarios of every milestone the Scenario judge can run, show them in one quiz with the milestones, and push the approved ones to the Holdout. Inputs, all from the step 3 draft: the project name, each milestone's name and what "complete" means, the spec's user stories. Output: one approved Holdout file per such milestone. Use only those inputs. Run it in Kickoff (all milestones) and in Feature whenever the spec adds a milestone (that one milestone); a Feature attached to an open milestone that already has a Holdout file adds none.

   **Which projects take Scenarios.** Only product projects whose milestones the judge can run: it runs Maestro flows against the product's app and nothing else (`scripts/scenarios.mjs flow`, ADR-0060), so a milestone counts when it ships something a Collector does in the app. A milestone of an Optio project (one that changes no app surface; Optio is the one today) cannot be judged: draft no Scenarios for it, skip 4.1 to 4.3, and say so in the quiz rather than skipping the step silently. A milestone with any Collector-visible app change takes Scenarios, whatever else it ships. What an Optio milestone records instead is in 4.5.

   1. Draft **3 to 7 Scenarios per milestone**, in `CONTEXT.md` words and in what a Collector sees: a `## <title>` (names the story, gives nothing away, safe to show an Engineer), `### Starting situation` (which Test Collector, which data), `### Actions` (what the Collector does), `### End state` (what the Collector has and sees). The exact format and its limits are in [docs/agents/scenarios.md](../../../docs/agents/scenarios.md); follow it, do not restate it. Cover the milestone's demoable promise end to end, not one slice's internals. No selectors, test ids or file paths.
   2. **One quiz.** Show the milestones and, under each, its Scenarios (titles with the three sections) together, and let the human approve, edit or drop. Nothing is pushed, saved or published before that approval. Re-draft and re-show until the human approves.
   3. **Push only approved Scenarios, only through the CLI.** For each milestone write its approved file (all its Scenarios, format above) to a temp file **outside this repo**, then run it as one plain command, with no pipe, `&&`, `;` or `$(`: a chained command loses the Holdout guard's exemption for the CLI, and one call per milestone keeps the push auditable.

      ```bash
      node scripts/scenarios.mjs put --project "<project name>" --milestone "<milestone name>" --file <temp file>
      ```

      Act on the one verdict line: exit 0 `SCENARIOS put ...: <n> Scenarios` is done; exit 2 `MALFORMED` means fix the file and rerun, `REFUSED` means the milestone already has Scenarios in the Holdout, so stop and tell the human (`put` never replaces); exit 4 means stop and report the cause. Then delete the temp file. Confirm with `node scripts/scenarios.mjs titles --project ... --milestone ...`.
   4. **Keep the text out of everything else.** Scenarios are never written to `{paths.specs}`, the spec, the Linear document, a milestone or project description, a comment or a PR. For a milestone that takes Scenarios, record in the spec's `## Linear` section only the Scenario count (an Optio milestone records its demo and live checks, 4.5). Never call `read`: only the Scenario judge reads the Holdout. `titles` is fine.
   5. **An Optio milestone records its demo and live checks instead.** In the same quiz, give each Optio milestone in `## Linear` one sentence of **Demo** (what is shown when it is complete) and its **Live checks** by name (`docs/agents/optio.md`, Live checks; `node scripts/live-check.mjs list`). A check that does not exist yet is written as a new check to add, never invented as if it ran. The human approves or edits these with the milestones.

5. Publish the approved spec, its milestones and the document (Kickoff or Feature below). Next step is `/to-tickets`. Do not publish Linear **issues** from this skill. Do not delegate. Do not open a PR.

The spec lives in `{paths.specs}/<slug>/spec.md` as well as Linear. Order: draft (3), Scenario quiz and `put` (4; for an Optio milestone, the demo and live checks quiz), publish (5). The project, milestones and document are published only after the quiz is approved.

Choose a **mode**. Ask if unclear.

### Kickoff

No Linear project exists for this effort (new product, or unscaffolded repo). The spec must organize the **whole picture**, not one flat feature.

Create **one** Linear project that looks like a project, not an empty shell. `save_project` on `linear.teamKey` with every field below. Then milestones, then the document. No issues.

**Project (`save_project`)**

| Field | Value |
| --- | --- |
| `name` | From the spec title / product effort |
| `setTeams` | `[linear.teamKey]` |
| `state` | `planned` |
| `summary` | One sentence from Problem Statement (≤255 chars) |
| `description` | Markdown: problem, solution, milestone list with what “complete” means. Not the full spec — that is the document |
| `lead` | `approver` from factory config |
| `labels` | `craft:*` from `labels.projects.items` that this effort actually touches. Whole-product kickoff typically all three. Names, not IDs. This **replaces** the label set — pass the full list |
| `priority` | Only if the conversation named it (`1` Urgent … `4` Low). Otherwise omit (Linear `None`) |
| `startDate` / `targetDate` | Only if the conversation named dates |
| `icon` / `color` | Omit unless the conversation named them |

`craft:design` = UI, layout, copy, a11y. `craft:frontend` = client surfaces. `craft:backend` = API / schema. PM filter only — never split a vertical slice by craft.

**Milestones** — each is a shippable increment, a **handful of vertical slices**, and the unit that later promotes `lanes.integration` → `lanes.staging`. Not tasks. Not “phase 1 / phase 2” as wishful labels. `save_milestone` with `name` **and** `description` (what “complete” means — demoable; ready to promote). `targetDate` only if named.

**Document** — `save_document` on that project with the spec body. Title = spec name.

Record spec type `kickoff` in `## Linear`. That label lives on issues `/to-tickets` may spawn later; do not create a dummy issue to hang it.

**Done when:** the Linear project has name, team, summary, description, lead, at least one `craft:*` label, and every milestone has a description. Opening it in Linear does not look blank.

Add `## Linear` (project name, craft labels, lead, priority if set, each milestone, what complete means). Keep the other headings.

### Feature

A Linear project already exists. This is a new slice on a specified product.

- `save_document` on that project only. Title = spec name. Body = spec.
- Record spec type `feature` (Linear Type **Feature** on issues `/to-tickets` will create). Do not create a dummy issue.
- Do **not** create a second project. Do **not** call `save_project` with `labels` — that replaces the whole set.
- If this feature is its own staging increment, `save_milestone` on the existing project with `name` and `description` (what “complete” means). If it belongs in an open milestone, attach there.

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
- **Craft labels:** `craft:…` (kickoff only)
- **Lead:** approver
- **Priority:** value, or None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Milestone name — what “complete” means (demoable; ready to promote integration → staging) — N Scenarios in the Holdout (a milestone of an Optio project: `Demo: <one sentence> — Live checks: <names>` instead, step 4.5)

## Further Notes

Any further notes about the feature.

</spec-template>
