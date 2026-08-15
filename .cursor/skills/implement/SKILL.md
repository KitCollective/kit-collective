---
name: implement
description: Kit Collective twist on Matt Pocock implement. Claims a Linear issue, runs tdd at seams, spawns domain helper sub-agents, opens a PR into development, moves to In Review. Use for KIT issues in Backlog/Rework/Implementing.
disable-model-invocation: true
---

# Implement (harness)

Follow `.agents/skills/implement/SKILL.md`: `/tdd` at agreed seams, typecheck often, `/code-review` before you call it done.

Then apply these twists from `WORKFLOW.md`:

1. Unattended eligibility: `Backlog` (delegated to Cursor, unblocked) or `Rework` or resume `Implementing`. Otherwise stop with no writes.
2. Claim `Backlog` → `Implementing` before code. One `## Agent Workpad` comment.
3. Branch from `origin/development`. One issue, one PR **into `development`**. Title `KIT-n: …`.
4. Spawn helpers in `.cursor/agents/` as needed (`ui-ux`, `react-expo`, `backend-nest`, `db-drizzle`, `devops`). They do not own Linear issues or change status.
5. Out of scope → `/signal-up` (cap 3).
6. After PR is attached: move issue to `In Review`. Do not merge. Do not move to `Done`.
