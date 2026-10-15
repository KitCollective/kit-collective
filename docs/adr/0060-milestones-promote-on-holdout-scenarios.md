# Milestones promote on Holdout Scenarios

Nicklas, 2026-10-15. Status: accepted. Builds on ADR-0048, ADR-0056, ADR-0058 and ADR-0059; research in `.scratch/Research/dark-factory.md`.

Today every proof that a slice works is written by the agent that built it: its tests and its own Device flow (`slices/<KEY>.yaml`). The Reviewer is on another model, but it reads the same proofs. So a green milestone shows that the implementers agree with themselves, not that a Collector gets what the spec promised. We add a proof the implementers cannot see, and make promotion to staging wait for it.

## Decisions

1. **The Holdout lives outside this repo and is provenance, not unforgeability.** Scenarios are kept in a private repo (`kit-scenarios/<project>/<milestone>.md`) that only the Scenario judge reads. On a shared bb machine (ADR-0058: every worker reuses the origin thread's environment and tokens) an implementing agent could still reach it. bb cannot give a thread a role (ADR-0058), so the guard is a PreToolUse hook that denies every thread direct access to the Holdout, leaving the scenarios CLI as the only way in: titles are free, and every full read is written to the run log with the reading thread, the same stance as the audit receipt (ADR-0056). The flows the Scenario judge generates from it run on the hosted macOS runner and are never committed to this repo.
2. **`Scenarios` is a required check on `staging`.** The Milestone scenarios workflow sets it on the `development → staging` promotion PR, and the milestone promotes only when every Scenario is met. ADR-0048 could not make `Device flows` required because it could not be limited to mobile PRs; a check required only on the `staging` branch has no such problem, because every PR into `staging` is a promotion.
3. **A failed Scenario becomes `To-do` + `ready-for-agent` without a `/to-tickets` quiz.** The Scenario judge files one issue per failed Scenario in the same milestone, carrying the Scenario's title and the judge's sentences, never the Scenario's text. The human approval already happened when the Scenario was approved in `/to-spec`; a second quiz would add a stop without adding information.

## Considered

- **Per-issue Scenarios inside the issue flow.** Rejected for now: a Scenario describes what a Collector gets from a milestone, which a single slice often cannot satisfy alone, and running macOS flows per PR multiplies the cost that ADR-0059 already flags.
- **Scenarios in this repo, hidden by convention.** Rejected: the implementer's worktree is this repo, so the Holdout would be one `grep` away and in every diff.

## Consequences

- `/to-spec` gains a Scenario step, approved in the same quiz as the milestones.
- The hosted Device flow run (ADR-0059) becomes load-bearing for promotion while its reliability is still unsettled; a flaky runner blocks staging, not just a PR.
- Test Collectors run with fixed Vision, so a Scenario proves the flow around Vision, never Vision quality. That stays with the Vision eval.
- Staging promotion now costs macOS minutes per Scenario run (three runs per Scenario).
