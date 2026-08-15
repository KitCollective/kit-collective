# Agent instructions — Kit Collective

Read `WORKFLOW.md` before writing code or touching Linear.

## Skill layers (do not mix)

| Path | What it is | Edit? |
| --- | --- | --- |
| `.agents/skills/` | Matt Pocock originals (`skills.sh`). Grill, to-spec, to-tickets, implement, tdd, code-review. | No. Update from upstream. |
| `.cursor/skills/` | Kit Collective harness twists. Same names wrap Matt’s process, then Linear/project/domain rules. | Yes. |
| `.cursor/agents/` | Domain helpers spawned from `/implement`. Not Linear issue owners. | Yes. |

Factory slash commands (`/to-spec`, `/to-tickets`, `/implement`, …) are the **Cursor** skills. They tell you to follow the matching file under `.agents/skills/` first.

## What this repo is

KitCollective is a Nordic football-shirt collector product (Expo + Nest + Astro). Product truth:

- `.scratch/Business/PRD.md`
- `.scratch/Architecture/tech-stack.md`
- `.scratch/Architecture/data-model.md`

Orchestration truth is `WORKFLOW.md`. If a spec fights a stack lock, change the lock document first.

## How work enters the factory

1. Human: `/grill-with-docs` until the design is sharp.
2. Human: `/to-spec` — kickoff creates a Linear **project + milestones**; feature mode attaches a spec to an existing project.
3. Human: `/to-tickets` — vertical slices as Linear issues in `Backlog`.
4. Human: delegate the issue to the Cursor agent (keep a human as assignee).
5. Cloud: implement → PR → checker → `Ready for merge`.
6. Human (Nick): read the GitHub PR, then move Linear to `Done`.
7. Cloud: merge into `development`. Project-complete then staging/production promotions.

## Tracker

Linear team `KIT`. See `docs/agents/issue-tracker.md`. After bootstrap, IDs live in `linear.setup.json`.
