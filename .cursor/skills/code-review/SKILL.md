---
name: code-review
description: Kit Collective twist on Matt Pocock code-review. Two-axis Standards vs Spec review; default merge-base is origin/development and spec source is the Linear issue. Use for implement sanity checks and the checker agent.
---

# Code review (harness)

Follow `.agents/skills/code-review/SKILL.md` (two axes, parallel sub-agents, smell baseline, no reranking).

Twists:

1. Default fixed point: merge-base with `origin/development` (not `main`).
2. Spec source order: `KIT-n` via Linear `get_issue` → project spec document → `.scratch/<slug>/spec.md`.
3. Standards sources also include `WORKFLOW.md`, `.cursor/rules/`, and `.scratch/Architecture/tech-stack.md`.
4. Checker uses the result to choose `Ready for merge` vs `Rework`. This skill does not merge or change status unless the caller is the checker agent.
