# Holdout Scenarios

Kickoff spec, 2026-10-15. Grilled in `/grill-with-docs` the same day; research in `.scratch/Research/dark-factory.md`; decisions in `docs/adr/0060-milestones-promote-on-holdout-scenarios.md`; terms (Scenario, Holdout, Satisfaction, Scenario judge, AFK developer, Milestone scenarios) in `CONTEXT.md`.

## Problem Statement

Nicklas wants the factory to build KitCollective without him reading code, but today every proof that a slice works is written by the agent that built it: its tests and its own Device flow. The Reviewer runs on another model but reads those same proofs. A green milestone therefore shows that the implementers agree with themselves, not that a Collector gets what the spec promised, so Nicklas still has to look before he trusts a promotion to staging.

## Solution

Each milestone gets a small set of **Scenarios**, end-to-end stories of what a Collector does and gets, drafted by `/to-spec` and approved by Nicklas in the same quiz as the milestones. They are kept in a **Holdout** outside this repo that implementing and reviewing agents are not allowed to read. When a milestone's issues are done, Nicklas starts **Milestone scenarios**: the **Scenario judge** turns each Scenario into a Device flow, runs it on the hosted macOS runner three times, judges the screenshots and recording, and sets a `Scenarios` status on the `development → staging` promotion PR. Staging only accepts the PR when every Scenario is met. A Scenario that is not met becomes an issue in the same milestone carrying its title and what went wrong, never the Scenario's text.

The per-issue workflow, renamed **AFK developer** (formerly `kit-issue`), tells the Engineer the titles of its milestone's Scenarios, so it knows what will be judged without seeing the answer key.

## User Stories

1. As Nicklas, I want `/to-spec` to draft 3–7 Scenarios per milestone, so that I approve what "works" means instead of writing it from scratch.
2. As Nicklas, I want to approve Scenarios in the same quiz as the milestones, so that approval stays one step.
3. As Nicklas, I want each Scenario written in `CONTEXT.md` words with a title, a starting situation (which Test Collector, which data), what the Collector does, and what must be true at the end, so that a judge can run it without guessing.
4. As Nicklas, I want approved Scenarios pushed to the private Holdout repo under the project and milestone, so that they never land in this repo or its diffs.
5. As a future product-developer agent, I want the Scenario step to be a fixed step in `/to-spec`, so that I can run the same procedure autonomously later.
6. As the factory, I want a hook that denies implementing and reviewing threads any read of the Holdout, so that the proof stays independent of the code.
7. As Nicklas, I want every read of the Holdout recorded with the reading thread, so that I can see the Holdout was kept, the same way the audit receipt shows provenance.
8. As Nicklas, I want it written down that the Holdout is provenance, not unforgeable, so that nobody over-trusts it.
9. As an Engineer in AFK developer, I want the titles of my milestone's Scenarios in my prompt, so that I build toward what will be judged.
10. As an Engineer, I never want a Scenario's text, so that I cannot fit the code to the answer key.
11. As Nicklas, I want `kit-issue` renamed AFK developer everywhere it is named (workflow file, its test, the bb-harness page, skills), so that the name says what it does.
12. As a reader of ADR-0058, I want a note that its workflow is now AFK developer, so that the old name still leads somewhere.
13. As Nicklas, I want to start Milestone scenarios myself from a bb thread when a milestone's issues are all `Done` or `Canceled`, so that nothing runs unattended yet.
14. As Nicklas, I want Milestone scenarios to refuse a milestone whose issues are not all done, so that it never judges half a milestone.
15. As the Scenario judge, I want to read only the Holdout file of the milestone I was given, so that one run judges one milestone.
16. As the Scenario judge, I want to generate a Device flow from each Scenario at run time, so that Scenarios stay prose and survive UI changes.
17. As the Scenario judge, I want the generated flows run on the hosted macOS runner from a run artifact, never committed, so that the Holdout does not leak into this repo.
18. As the Scenario judge, I want each Scenario run three times on the same `development` SHA, so that one flaky run does not decide.
19. As the Scenario judge, I want to judge each run from the Scenario text, the step screenshots and the recording, never the diff or the code, so that I judge what the Collector gets.
20. As the Scenario judge, I want to return one verdict per run (`satisfied` or `not-satisfied`) plus one sentence on where the Collector got stuck, so that the result is countable and explainable.
21. As Nicklas, I want a Scenario met when at least two of its three runs are satisfied, so that noise does not block promotion.
22. As Nicklas, I want the milestone to pass only when every Scenario is met, not on an average, so that one broken journey cannot hide behind good ones.
23. As Nicklas, I want the runs-per-Scenario and the met threshold in `factory.config.json`, so that changing them is a committed decision.
24. As Nicklas, I want Satisfaction (the share of satisfied runs) reported as a trend, not as the gate, so that I can see quality move without it deciding.
25. As Nicklas, I want a `Scenarios` commit status on the promotion PR head, pending while running and success or failure with a link, so that the PR shows the verdict.
26. As Nicklas, I want `Scenarios` to be a required check on `staging`, so that a promotion cannot merge without it.
27. As Nicklas, I want one short comment on the milestone with Satisfaction and the titles of failed Scenarios, so that Linear shows the result too.
28. As Nicklas, I want one `To-do` + `ready-for-agent` issue per failed Scenario in the same milestone, carrying the title and the judge's sentences, so that the fix enters the normal flow without another quiz.
29. As an Engineer fixing a failed Scenario, I want the judge's sentences but not the Scenario text, so that I fix the journey, not the test.
30. As Nicklas, I want Milestone scenarios to keep a run log, schema results and hard stops like AFK developer, so that I can trust and audit it the same way.
31. As Nicklas, I want Milestone scenarios to never merge, never promote and never change a milestone's issues except by filing the failure issues, so that its blast radius is small.
32. As Nicklas, I want a hosted runner that fails or stops early to leave `Scenarios` as error, not pending, so that a broken runner is visible and never reads as a pass.
33. As Nicklas, I want a Scenario that needs Vision to run with the Test Collector's fixed Vision, so that it proves the flow around Vision; Vision quality stays with the Vision eval.

## Implementation Decisions

- **New module: the scenarios CLI.** A deep module with one verdict line per call (ADR-0053) and three jobs: list a milestone's Scenario titles (for AFK developer), list a milestone's Scenarios in full (for the Scenario judge only), and score a set of run verdicts into met / not met per Scenario, a milestone verdict and Satisfaction, against the thresholds in `factory.config.json`. It also sets the `Scenarios` commit status. All counting and threshold logic lives here, never in a workflow script, because workflow scripts relay through runner models (ADR-0058).
- **Holdout store.** A private GitHub repo, `kit-scenarios`, one Markdown file per milestone under the project. The scenarios CLI is the only reader. Creating the repo and giving the harness read access is a human step (`/wizard` if it needs more than one command).
- **Scenario format.** Each Scenario: a title (one line, safe to show to the Engineer), a starting situation (Test Collector and data), the Collector's actions, and the end state that must be true. Prose, `CONTEXT.md` vocabulary, no selectors.
- **Holdout guard.** A PreToolUse hook denies the Holdout repo and its paths to any thread that is not the Scenario judge, and the run log records each read with its thread id (ADR-0052's orchestrator remains the only writer). The ADR-0060 stance: provenance, not unforgeability.
- **`/to-spec` gains a Scenario step** after milestones: draft 3–7 per milestone, show them in the milestone quiz, push the approved file to the Holdout. Skill edit under `.cursor/skills/to-spec/`.
- **AFK developer** is `kit-issue` renamed, plus one step before the Engineer: the scenarios CLI lists the titles for the issue's milestone, and they go into the Engineer prompt. A milestone with no Holdout file gives "no Scenarios", never an error. Only the name changes in ADR-0058, by a note.
- **Milestone scenarios** is a new bb workflow with the same shape as AFK developer: args (`milestone`, `pr`), a session check (every issue in the milestone `Done` or `Canceled`, the PR is `development → staging`), run log start, Scenario judge per Scenario (generate flow), hosted runs, judge per run (schema'd verdict), scores via the scenarios CLI, status, milestone comment, failure issues, hand-over. Judge model `claude-opus-5-5` high. Writes no issue state except creating failure issues.
- **Hosted run accepts an external flow.** The Device flows workflow on the macOS runner gains a manual trigger that takes a flow from a run artifact instead of `slices/`, runs it as the Test Collector against the runner's own Postgres and API (as today), and uploads screenshots and recording. It does not set the `Device flows` status (that stays the slice run's).
- **Thresholds in config.** `factory.config.json` gets a `scenarios` block: runs per Scenario (3), satisfied runs to meet (2), and the Holdout repo name.
- **Staging protection.** Branch protection on `staging` with `Scenarios` required. A human step (repo admin).
- **Failure issues** use the normal Linear issue shape with `ready-for-agent`, in `To-do`, in the milestone; the body holds the Scenario title, the judge's sentences and a link to the run, never the Scenario text (ADR-0060).

## Testing Decisions

- A good test checks behaviour at a public interface: the verdict line and exit code of a CLI, the commands and spawns a workflow issues, the allow/deny a hook returns. Never internals.
- **Seam S1, workflow scripts.** AFK developer and Milestone scenarios are tested the way `kit-issue` is today: the workflow source runs in a plain async function with `agent`, `phase` and `args` replaced by a scripted fake that plays runners, Engineer, Reviewer and Scenario judge, and records every command and spawn. Prior art: `scripts/tests/kit-issue-workflow.test.mjs`. Covers: titles reach the Engineer prompt and Scenario text never does; Milestone scenarios refuses an unfinished milestone; three runs per Scenario; a runner failure ends as error; failure issues carry title and sentences only; no merge or promotion commands ever.
- **Seam S2, the scenarios CLI.** Tested through its command line with fixture Holdout files and fixture verdict sets: titles vs full text, met/not-met at the 2-of-3 edge, all-must-be-met, Satisfaction arithmetic, missing milestone file, bad input refused with exit 2 (ADR-0053). Prior art: `scripts/tests/gates.test.mjs`, `scripts/tests/review-matrix.test.mjs`.
- **Seam S3, the Holdout guard hook.** Tested by feeding PreToolUse JSON on stdin and asserting allow or deny for Read, Bash and Grep against Holdout paths, per role. Prior art: the existing ratchet hook under `.claude/hooks/`.
- The `/to-spec` Scenario step and the hosted runner trigger are verified by a real run, recorded as evidence on their issues, not by unit tests.

## Out of Scope

- Lights off: automatic dispatch, merging without Nicklas, token budgets instead of `maxRounds` (research note step 4).
- Digital twins of Vision, IAP, Linear or auth.
- Per-issue Scenario runs inside AFK developer.
- Automating the promotion PR (automation 4 stays "wire later"); Nicklas still opens it.
- Judging Vision quality; that stays with the Vision eval.
- An autonomous product-developer agent running `/grill-with-docs` → `/to-spec`; the Scenario step is only shaped so one could later.
- Fixing the stale PI-era terms in `CONTEXT.md` (Device flow still says it runs on the approver's Mac, contradicting ADR-0059).

## Linear

- **Project:** Holdout Scenarios
- **Mode:** kickoff
- **Craft labels:** `craft:backend`
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones:**
  1. Holdout — the private Holdout repo exists, `/to-spec` drafts and pushes approved Scenarios, the guard hook denies implementing and reviewing threads, reads are logged, and the scenarios CLI lists titles and full Scenarios. Complete when one real milestone's Scenarios sit in the Holdout and a denied Engineer read shows in the run log.
  2. AFK developer — `kit-issue` is renamed everywhere with a note on ADR-0058, and the Engineer prompt carries the milestone's Scenario titles. Complete when `bb workflows validate` is green and one real issue runs with the titles in its Engineer prompt.
  3. Milestone scenarios — the workflow, flow generation, hosted runs from an artifact, scoring in config, the `Scenarios` status, the milestone comment, failure issues, and `Scenarios` required on `staging`. Complete when one real milestone is judged end to end and a red `Scenarios` blocks its promotion PR.

## Further Notes

- This project's own milestones cannot use Scenarios until milestone 3 is done; they promote the old way.
- The hosted Device flow run is not yet reliable (ADR-0059: one cancelled and two red nightly runs, no hosted slice run yet, one photo in the simulator). Milestone 3 makes it load-bearing for staging.
- ADR numbering: the unmerged branch `origin/claude/auto-land` carries its own `0059-auto-land…`; when it lands it must take the next free number after 0060.
- Cost: three macOS runs per Scenario per promotion, at ten times the Linux rate (ADR-0059). Measure on the first real milestone before raising runs.
