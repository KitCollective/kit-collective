---
name: to-spec
description: Kit Collective twist on Matt Pocock to-spec. Synthesizes a spec then publishes a Linear project + milestones (kickoff) or a document on an existing project (feature) — not a single issue. Use when turning a grilled design into a spec for this repo.
disable-model-invocation: true
---

# To spec (harness)

Follow `.agents/skills/to-spec/SKILL.md` for process, seams, and the spec template. Do not skip the seam check.

Then apply these twists:

1. Write the spec to `.scratch/<slug>/spec.md` as well as publishing.
2. **Do not** publish a single Linear issue.
3. Choose mode:
   - **Kickoff** (default while the product is unscaffolded, or no Linear project exists): `save_project` on team `KIT`, status `planned`, then `save_milestone` for each completion stage, then `save_document` with the spec body. Label `kickoff`.
   - **Feature**: `save_document` on the existing project only. Label `feature`.
4. Add a `## Linear` section to the spec (project name, milestone names, what “complete” means). Keep Matt’s other headings.
5. Next step is `/to-tickets`, not `/implement`. Do not delegate.

Read `WORKFLOW.md` and `docs/agents/issue-tracker.md` before publishing. If `linear.setup.json` is missing, stop and run `/bootstrap-linear`.
