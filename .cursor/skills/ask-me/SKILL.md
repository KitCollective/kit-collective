---
name: ask-me
description: Ask which factory skill or flow fits your situation. A router over the skills in this repo.
disable-model-invocation: true
---

# Ask me

You don't remember every skill, so ask.

Load `factory.config.json` then `WORKFLOW.md`. Read [../_shared/factory.md](../_shared/factory.md).

This is Matt’s `/ask-matt`, renamed. It **hints**; it does not fire another user-invoked skill. Tell the human which slash to type. Model-invoked skills (`/tdd`, `/codebase-design`, `/diagnosing-bugs`, …) may be reached from here when the task already fits.

A **flow** is a path through the skills. Most paths run along one **main flow**, and two **on-ramps** merge onto it. Everything else is standalone, or a vocabulary layer that runs underneath.

## Factory twist

- Never `/grill-me`. We always have a repo → `/grill-with-docs`.
- Never `/wayfinder`. Linear **project + milestones** are the map (`/to-spec` kickoff).
- Never `/setup-matt-pocock-skills`. Missing board → `/bootstrap-linear`.
- Do not invent Linear statuses. Dispatch is `dispatch.state` + `ready-for-agent` + unblocked. Never set Linear Agent to Cursor. Linear priority is claim order, not eligibility.
- `/land` merges to `lanes.integration` only. Never staging/production from an issue run.

## The main flow: idea → ship

The route most work travels. You have an idea and want it built.

1. **`/grill-with-docs`** — sharpen the idea by interview. Kickoff (whole product) or feature (existing Linear project). Writes `CONTEXT.md` terms and ADRs. Next step is `/to-spec` in the **same** conversation — or `/to-design` first when surfaces need a shared visual lock.
2. **Branch — can you settle every question in conversation?** If a question needs a runnable answer (state, business logic, a UI you have to see), detour through **`/prototype`**. Same repo → invoke it here. New session or directory → **`/handoff`** out and back. The prototype answers the question; it does not implement the issue.
3. **`/to-design`** — when implementing agents will build UI and taste is still implicit. HITL. Writes `docs/design-system.md`. A look you must see is still `/prototype`, then back. Skip this step when the work is not visual.
4. **`/to-spec`** — kickoff = one Linear project + milestones (no issues). Feature = document on the existing project; new milestone only if this feature is its own staging increment.
5. **`/to-tickets`** — vertical slices onto **one milestone each**, `dispatch.state`, `ready-for-agent`, `blockedBy`. Never set Linear Agent to Cursor.
6. **Planner** claims `Backlog` + `ready-for-agent` + unblocked → `Implementing`. Human stays assignee. Do not set Agent to Cursor.
7. **`/implement`** — one issue, one branch from `lanes.integration`, one PR into that lane. Drives **`/tdd`** at spec seams (`/codebase-design` vocabulary). Hard repro with no loop yet → **`/diagnosing-bugs`** first. Out of scope → **`/signal-up`** (cap applies). Closes with **`/code-review`** before `In Review`. UI slices follow `docs/design-system.md` when it exists.
8. **Checker** — `/code-review` again (judge only) **and** GitHub CI/CD on the PR. Pass + required checks green → `Ready for merge`. Fail → `Implementing` + workpad `### Review feedback`.
9. **Approver** reads the GitHub PR, moves Linear to `Done`. That **is** merge approval.
10. **`/land`** into `lanes.integration`. A complete **milestone** then staging / production (not this skill).
11. **`/reap-worktree`** — verify integration, drop the issue worktree, delete merged remote branch (Desktop).

### Context hygiene

Keep grilling → spec → tickets in **one unbroken context window**. Each `/implement` starts fresh from the Linear issue. `/to-design` may share that window or be its own sitting — `docs/design-system.md` is the handoff.

The limit is the **[smart zone](https://www.aihero.dev/ai-coding-dictionary/smart-zone)** (~150k tokens). If a session approaches it before `/to-tickets`, compact at the nearest phase boundary — see [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md).

## On-ramps

- **Something's broken** → **`/diagnosing-bugs`**. Tight red-capable loop before a fix. Then `/tdd` at the seam on a bug issue, or `/signal-up` if found mid-implement.
- **Bugs and requests piling up** → human triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`). This factory has not copied Matt’s `/triage` skill. Tickets from `/to-tickets` are already agent-ready — **don't re-triage them**.
- **A huge, foggy effort** → `/grill-with-docs` **kickoff** in rounds, then `/to-spec` (project + milestones). Not wayfinder.
- **Agents guess layout, tokens, or components** → **`/to-design`**. HITL. Writes `docs/design-system.md`.

## Codebase health

Not feature work — upkeep.

- **`/codebase-design`** — deep-module vocabulary when a seam’s *shape* is the problem. Human sessions may Design It Twice. Unattended `/implement` consults it; does not invent seams beyond the spec.
- **`/improve-codebase-architecture`** — survey deepening opportunities as an HTML report, then grill the one you pick. Generates an idea for `/to-spec`, it does not implement.

## Vocabulary underneath

- **`/grill-with-docs`** already drives domain language into `CONTEXT.md` / ADRs (Matt’s `/domain-modeling` is inlined there).
- **`/to-design`** — visual and interaction language into `docs/design-system.md`. Taste, foundations, tokens, components. Agents flag gaps; they do not invent rules.
- **`/codebase-design`** — module, interface, depth, seam, adapter, leverage, locality.

## Factory-only

- **`/signal-up`** — out-of-scope bug/debt: new Linear issue in **Triage**, label `signal-up` only. Never delegate. Cap per run.
- **`/land`** — merge the GitHub PR after `Done`. Integration lane only.
- **`/reap-worktree`** — after land: verify branch on integration, remove issue worktree, delete merged remote branch (Desktop hygiene).
- **`/sync-development`** — safely fast-forward the main repo's `lanes.integration` with `origin` (stash WIP, `--ff-only`, stop on diverge).
- **`/bootstrap-linear`** — board missing or unshaped (`linear.setup.json` absent).
- **`/create-new-skill`** — author a factory skill under `.cursor/skills/`.
- **Vendor Expo skills** — `.cursor/skills/expo/`. Not slash commands. `/implement`, `/tdd`, and checker load them on mobile and EAS work. Product docs win on conflict.
- **`/to-design`** — HITL visual lock into `docs/design-system.md`. Factory-original.
- **`/ask-me`** — this router.

## Phase boundaries

At the gap between two phases you have five options. Read [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md). Make the decision **at** a boundary; mid-phase, continue or split the rest into subagents.

## Standalone

Off the main flow. Skills marked *not copied* are Matt’s — do not invent a local substitute.

- **`/code-review`** — two-axis Standards + Spec of the diff since the integration-lane merge-base. Checker uses it; `/implement` may too.
- **`/tdd`** — red-green-refactor at a seam, without a full spec.
- **`/create-new-skill`** — new or edited factory skill.
- **`/wait-what`** — the last message did not land. Re-pitch in `CONTEXT.md` language. Works mid-conversation, inside any skill.
- **`/prototype`** — throwaway code that answers one design question (logic HTML or UI variants). Then back to grill / `/to-design` / `/to-spec`.
- **`/research`** — background agent, cited primary sources, Markdown under `{paths.specs}`. Feeds grilling; does not replace it.
- **`/handoff`** — portable session file. Default OS temp; `{paths.specs}/<effort>/handoff.md` when the next agent is on this repo.
- **`/wizard`** — interactive bash for steps only a human can take (secrets, dashboards, cutover). Not for steps the agent can do.
- **`/sync-development`** — catch up local `lanes.integration` with `origin` without force-push or silent discard.
- **`/to-video-brief`** — a video idea into a brief a Higgsfield workflow can render: routes to the workflow, grills only what the workflow leaves open, writes `docs/video-system.md` plus one brief per video, then renders. Higgsfield owns prompt craft; we own claims, language, and what is on screen.
- **`/resolving-merge-conflicts`**, **`/grill-me`**, **`/teach`**, **`/to-questionnaire`** — not copied. Merge conflicts: Cursor `fix-merge-conflicts`. Grill: `/grill-with-docs`.

## Precondition

**`/bootstrap-linear`** if `linear.setup.json` is missing. Then the main flow.
