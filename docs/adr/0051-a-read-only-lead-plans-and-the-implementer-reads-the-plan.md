# A read-only lead plans each issue, and the implementer reads the plan

Nicklas, 2026-10-10, while moving the issue flow to bb threads that run on several machines. Today `/implement` plans and builds in one context. Optio, which adopted this factory and evolved it, splits that: a Lead plans, an Engineer builds. We take the split, not Optio's `@optio/harness` package.

Decisions:

1. **A `lead` agent (`.cursor/agents/lead.md`) plans.** It is read-only on a strong model, spawned by `/issue-session` at start and at a replan, never by the implementer and never from `/tdd`. It decides plan or not and which Role helpers (frontend, backend, devops) the slice gets, and writes `### Plan` in the single workpad comment: context map, steps, file split (no file in two briefs), briefs, risks, outside-the-scope. It writes no code and touches nothing in Linear except the workpad. Result line: `LEAD-RESULT KIT-n plan|plan-approval|stop <sentence>`. Naming: in this repo "planner" stays the claim/dispatch agent.
2. **Rules in code decide plan-or-not and the implementer's model.** `scripts/lib/start-decision.mjs`: a plan when the issue is risk medium or high, the write-scope touches auth, schema or workflows, spans more than one app, has no Testing section, or an approval label asks for one. The implementer runs on the strong model for high-risk issues, after two red audits, and on any replan. No external service: Optio asks Jev (a TypeSafe-key decision service) and falls back to the same rules; we keep only the rules.
3. **`/implement` reads `### Plan`.** It keeps `/tdd`, the Roles and the pre-review gate; a contradiction with reality goes under `### Notes` and the orchestrator replans. With no `### Plan` it plans inline as before, so a run without `/issue-session` still works.

Optio's open question, which they never measured: does a Lead cost more tokens than it saves in review rounds? Plans are not free (one strong-model session per issue, more at replan). ADR-0052's run log answers it here: `node scripts/run-log.mjs report` compares issues with and without a lead spawn by review rounds, share of first audits that were red, tokens per issue, and the share of tokens spent after the first red audit. If the lead issues are not cheaper in rounds and tokens after a few dozen issues, narrow the rules (plan less often) or drop the lead.

Gives up: one more handoff per planned issue, and a plan that goes stale while the implementer works (the replan rule covers it, at a cost).

Status: accepted. Changes `.cursor/skills/implement` (plan step) and `.cursor/skills/issue-session` (lead step, replan).
