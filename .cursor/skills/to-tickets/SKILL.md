---
name: to-tickets
description: Kit Collective twist on Matt Pocock to-tickets. Breaks a spec into vertical-slice Linear issues under project milestones with native blockedBy. Does not delegate. Use after /to-spec in this repo.
disable-model-invocation: true
---

# To tickets (harness)

Follow `.agents/skills/to-tickets/SKILL.md` for tracer-bullet slicing, blocking edges, the user quiz, and the ticket template.

Then apply these twists:

1. Publish to Linear team `KIT`, not GitHub Issues and not `.scratch/.../issues/` files (those are only a fallback if Linear is down).
2. Every issue: status `Backlog`, parent **project + milestone** from the spec, native `blockedBy`, label `ready-for-agent`.
3. Surface labels (`surface:api`, `surface:mobile`, …) are hints for `/implement` helpers. They are **not** a reason to split into horizontal tickets.
4. **Do not delegate. Do not assign Cursor.** Dispatch is a human step.
5. After publish, tell the user: an unblocked Backlog issue runs when they delegate it to Cursor.
