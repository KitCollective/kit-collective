# Planning stack

Operator path from idea to landed work. Matt’s engineering loop, Linear as the tracker.

## Path

```text
/grill-with-docs → /to-design (when UI needs shared rules) → /to-spec → /to-tickets
  → human delegates to linear.delegateAgentName
  → planner claims (Backlog → Implementing)
  → /implement (/tdd + domain helpers) → PR + Linear evidence → In Review
  → checker (/code-review)
  → approver reads the PR, Linear → Done
  → /land into lanes.integration
  → milestone complete → staging → production
```

Use **`/grill-with-docs`**, never `/grill-me`. Grill-me writes no files and needs no repo. This factory always has a repo.

| What you have | Skill |
| --- | --- |
| Whole product / no Linear project yet | `/grill-with-docs` **kickoff** → `/to-spec` kickoff (project + milestones) |
| New feature on an existing specified product | `/grill-with-docs` **feature** → `/to-spec` feature (document ± one milestone) |
| Too big for one sitting | Same grill, more rounds. Linear project + milestones **are** the map (not Matt’s wayfinder tickets). |

Keep `/to-tickets` (Matt’s name). It slices vertical issues onto a **milestone**. A milestone is a handful of issues that promote to staging together. `/to-spec` owns the project/milestone map; renaming the slicer to “to-planning” would mix those jobs.

## What each step owns

| Step | Output |
| --- | --- |
| `/grill-with-docs` | Shared understanding. Terms in `CONTEXT.md` Language. Sparse ADRs. |
| `/to-design` | AI-ready visual lock in `docs/design-system.md`. HITL. Skip when the work is not visual. |
| `/to-spec` | Spec file + Linear project/milestones (kickoff) or document ± milestone (feature). Seams confirmed. |
| `/to-tickets` | Vertical Linear issues on **one milestone each**, `dispatch.state`, `ready-for-agent`, `blockedBy`. **Not delegated.** |
| Delegate | Human. Agent field = `linear.delegateAgentName`. |
| Planner | Cron. Claims `dispatch.state` → `Implementing` under `agent.maxConcurrent`, in Linear priority order. No code. |
| `/implement` | Wakes on `Implementing`. Branch + PR + Linear evidence → `In Review`. |
| Checker | Wakes on `In Review`. Judge-only. Pass → `Ready for merge`. Fail → `Implementing` + `### Review feedback` (same branch). |
| Approver | Reads the GitHub PR. Linear `Done` **is** merge approval. |
| `/land` | Merge to integration only. |
| Staging | When **that milestone’s** issues are all Done or Canceled. |

## Router

Lost? `/ask-me` (Matt’s `/ask-matt`). Hints the next slash. Does not fire another user-invoked skill.

Message didn’t land? `/wait-what`.

Architecture upkeep? `/improve-codebase-architecture` (survey → grill → `/to-spec`, no implement).

Design question you can’t settle on paper? `/prototype`. Visual system still implicit? `/to-design`. Reading legwork? `/research`. Session must travel? `/handoff`. Human-only setup? `/wizard`.

New factory skill? `/create-new-skill` (Matt’s `writing-for-agents` + the old `write-a-skill` process).

## Still not copying

Conductor `/factory/*`, wayfinder GitHub tickets, GitHub Issues as SoT, `/grill-me`, `/setup-matt-pocock-skills`.

Matt’s engineering + productivity loop that this factory uses is in `.cursor/skills/`. `/triage` is labels here, not Matt’s skill. Merge conflicts: Cursor `fix-merge-conflicts`.
