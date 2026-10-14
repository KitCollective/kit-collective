# Dark Factory: what it is, what it takes, and how KitCollective's factory would get there

Research note, 2026-10-14. Feeds `/grill-with-docs`; it decides nothing. Trigger: a TikTok from "The AI Operator" ("Humans write one thing": a human-written `spec.md` goes into an agent loop *write → run → break → fix* that runs *until it works*; caption: "No human writes this code. No human reads it either. A 3-person team…"). The 3-person team is StrongDM's AI team.

## 1. What a Dark Factory is

The term comes from Dan Shapiro's "Five Levels" (January 2026), modelled on the driving-automation levels. It borrows from manufacturing: a factory run by robots with the lights off, because robots do not need to see.

| Level | Name | The human's job |
| --- | --- | --- |
| 0 | Spicy autocomplete | Writes the code; AI completes lines |
| 1 | Coding intern | Writes the important code; reviews all AI snippets |
| 2 | Junior developer | Pair-programs; reads every line |
| 3 | Developer | AI writes most code; human is a full-time reviewer |
| 4 | Engineering team | Writes specs and plans like a manager; agents build |
| 5 | Dark software factory | Nobody. Specs go in, software comes out |

Source: Shapiro, <https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/> (summarised by Simon Willison, <https://simonwillison.net/2026/Jan/28/the-five-levels/>).

The reference implementation is **StrongDM's Software Factory** (manifesto 2026-02-06, <https://factory.strongdm.ai/>; outside account by Simon Willison, <https://simonwillison.net/2026/Feb/7/software-factory/>):

- **Two rules:** code must not be written by humans; code must not be reviewed by humans.
- **Benchmark:** at least $1,000 of tokens per human engineer per day (~$20k/month). Willison's main caveat: at that price the pattern is a question of whether the business can afford it.
- **Loop:** *seed → validation harness → feedback*, with tokens as the fuel (<https://factory.strongdm.ai/principles>). The seed can be a spec, a few sentences, a screenshot or an existing codebase. Validation is end-to-end and as close to the real environment as possible. A sample of output is fed back into the inputs. It runs until the holdout scenarios pass and keep passing.
- **Team:** three people (Justin McCarthy, Jay Taylor, Navan Chauhan), started July 2025.

## 2. What it actually takes

The writing is the easy part. Every serious source lands on the same point: **the bottleneck is verification, not model intelligence.** If agents write both the code and the tests, a green suite proves nothing (an agent can write `assert true`). StrongDM's answers, in order of importance:

1. **Holdout scenarios instead of tests.** End-to-end user stories stored *outside* the codebase, invisible to the coding agents, like a holdout set in model training. Validated by an LLM, not by rigid assertions.
2. **Satisfaction instead of "green".** The fraction of observed trajectories through all scenarios that likely satisfy the user. Probabilistic, so it suits software with agentic parts.
3. **Digital Twin Universe (DTU).** Behavioural clones of every third-party dependency (they built Okta, Jira, Slack, Google Docs/Drive/Sheets), built by agents from public API docs as self-contained binaries, with public reference SDKs as the compatibility target. Buys thousands of scenario runs per hour, failure modes you cannot trigger against live services, no rate limits, no API cost.
4. **Spec quality as the product.** The human output is the spec plus the scenarios. StrongDM's own coding agent, Attractor (<https://github.com/strongdm/attractor>), ships as three markdown spec files and no code.
5. **Representations the model can read.** Every obstacle is turned into something the model can consume: traces, screen captures, transcripts, incident replays, adversarial use, simulated users.
6. **Techniques** (<https://factory.strongdm.ai/techniques>): Gene Transfusion (lift patterns from one system into another), Semports (port code between languages), Pyramid Summaries (layered summaries an agent can zoom through).

Open criticism worth keeping in view: accountability for behaviour nobody read (Stanford CodeX, <https://law.stanford.edu/2026/02/08/built-by-agents-tested-by-agents-trusted-by-whom/>), and that someone still has to understand the system well enough to write the spec and notice when it goes sideways.

## 3. Where KitCollective's factory is today

On Shapiro's scale the factory is a solid **Level 4** with several Level-5 parts already built:

| Dark-factory ingredient | KitCollective today | Gap |
| --- | --- | --- |
| Human writes only the spec | `/grill-with-docs` → `/to-spec` → `/to-tickets`; agents implement | Close. `/to-design` and Approval are still human |
| No human reads the code | Reviewer is a fresh thread on a *different model* than the Engineer (`.bb/workflows/kit-issue.js:89`), gates are scripts with one verdict line (ADR-0053) | Human still moves `Approval → Merging` and re-runs `gate.mjs review` before merge (`docs/agents/bb-harness.md`) |
| Loop until it works | Engineer ↔ pre-review gate ↔ Reviewer, `maxRounds` 1–3; `flow.maxRunsPerDay` 3 | Hard round caps, then stop for a human. A dark factory loops against a budget, not a round count |
| Holdout scenarios | None. The Engineer writes its own Device flow `apps/mobile/.maestro/slices/<KEY>.yaml` in the same PR (`docs/agents/device-flows.md`) and its own tests | **Biggest gap.** The thing that proves the slice is written by the thing being proven |
| Satisfaction metric | Boolean gates; but `.scratch/vision-qa/eval-retest-*.json` already scores the Vision pipeline over a fixed set | The vision evals are the seed of a satisfaction score; nothing else is scored |
| Digital twins | Missing. bb-harness has no Postgres (api/db suites end `INCOMPLETE`), no simulator (device flows go to a GitHub macOS runner) | Vision provider, IAP (App Store / Play), Linear, auth have no twins |
| Autonomous dispatch | None since the PI worker was archived 2026-09-01. Nicklas starts `kit-issue` per issue | Needs a scheduler that claims `To-do` + `ready-for-agent` + unblocked |
| Error ratcheting | `docs/agents/error-ratcheting.md`, `.claude/hooks/cursor-ratchet.mjs` | Already a dark-factory habit: mistakes become rules, not reviews |

## 4. What a dark KitCollective factory could look like

Keep the spine (Linear as control plane, bb `kit-issue` workflow, gates as scripts). Change four things, in this order, because each one is only safe once the one before it exists:

### Step 1 — Holdout scenarios (makes everything else trustworthy)

- `/to-spec` (human) also writes **scenarios** per milestone: end-to-end user stories in plain language, e.g. "A collector photographs a 1998 home jersey on a dark background and gets the right club, season and kit type within one retry."
- They live **outside the Engineer's worktree**: a separate private repo or a path the workflow never mounts for the Engineer/Reviewer, read only by a new **Validator** step.
- The Validator runs after the review gate: it turns each scenario into a Device flow / API run against the PR build, executes it N times, and an LLM judge scores each trajectory. The Engineer's own slice flow stays as evidence; it stops being the gate.
- The Validator reports only a score and failing scenario *titles* back to the Engineer, never the scenario text, so the holdout stays a holdout.

### Step 2 — Satisfaction as the gate

- Generalise the existing vision-qa eval (`.scratch/vision-qa/`) into `scripts/satisfaction.mjs`: scenarios × runs → fraction satisfied, one verdict line (fits ADR-0053).
- Threshold per milestone in `factory.config.json` (e.g. `satisfaction.min: 0.9`). Below → back to the Engineer with titles; above → eligible to merge.

### Step 3 — Digital twins for the dependencies

Priority by how often they block or cost money:

1. **Postgres in the harness** (not a twin, just a container) so `api`/`db` suites stop ending `INCOMPLETE`.
2. **Vision provider twin**: replay recorded responses keyed by image hash, plus injected failure modes (timeout, malformed JSON, low confidence). Unlimited runs at zero token cost.
3. **IAP twin** (App Store / Play receipts and webhooks): purchase, refund, expired, sandbox edge cases.
4. **Linear twin** for workflow tests of the factory itself.

### Step 4 — Lights off

- Dispatch: a scheduler (bb schedule, or a Claude Code routine) claims `To-do` + `ready-for-agent` + unblocked, as the archived worker did, respecting `write-scope`.
- Merge: when review gate + satisfaction ≥ threshold + required checks green, auto-merge into `development` (the merge lock and `gate.mjs land` already exist). The human gate moves to **milestone → staging** and **staging → production** only, which `release` already owns.
- Replace `maxRounds`/`maxRunsPerDay` with a **token budget per issue** plus a stall detector (same failing scenario N times → `Approval` with `ready-for-human`).

What stays human, deliberately: grilling, specs, scenarios, `/to-design`, promotion to production, and triage of `signal-up` / `proposal`. That is the "one thing humans write" from the video.

## 5. Claude Code building blocks (docs as of 2026-10)

Read 2026-10-14. Not verified by running; flagged items were not confirmed in the docs.

| Need | Claude Code feature | Notes / limits | Doc |
| --- | --- | --- | --- |
| Unattended run | `claude -p` with `--permission-prompts none`, `--max-turns`, `--max-budget-usd`, `--output-format json` (gives `total_cost_usd`) | `--bare` skips hooks, skills, subagents and CLAUDE.md, so a factory must **not** use it, or must pass the verifier via `--settings` | <https://code.claude.com/docs/en/headless> |
| Loop "until it works" | **Stop hook**: exit 2 (or `{"decision":"block"}`) blocks stopping and feeds stderr back to the model | After 8 consecutive blocks without a tool call Claude Code ends the turn anyway; the counter resets on every tool call, so an outer turn/budget cap is the real bound | <https://code.claude.com/docs/en/hooks> |
| Agent can't edit its own verifier | **PreToolUse hook** returning `permissionDecision: "deny"` on test files, scenario paths, the feature list | Hooks run in parallel, 600 s default timeout; set `"onFailure": "block"` so a timed-out guard still blocks | same |
| Engineer / Reviewer / Validator roles | **Subagents** (`.claude/agents/*.md`): `tools`, `disallowedTools`, `model`, `maxTurns`, `isolation: worktree` | Nesting depth 3, 20 concurrent by default. In this repo `.claude/agents` → `.cursor/agents` | <https://code.claude.com/docs/en/sub-agents> |
| Deterministic orchestration | **Workflows** (JS with `agent()`, `pipeline()`, `parallel()`, saved under `.claude/workflows/`) | 16 concurrent agents by default, 1,000 per run, no mid-run user input, resumable. In `-p`/SDK it needs a `Workflow(<name>)` allow rule. Same shape as bb's `kit-issue.js` | <https://code.claude.com/docs/en/workflows> |
| Embed in your own service | **Agent SDK** `query()` with `maxTurns`, `maxBudgetUsd`, `disallowedTools`, `permissionPrompts: "none"` | `maxBudgetUsd` is a client estimate and can overshoot; `allowedTools` approves but does not restrict | <https://code.claude.com/docs/en/agent-sdk/overview> |
| Lights-off dispatch | **Routines** (research preview): schedule (hourly min), API `fire`, GitHub events, on Anthropic cloud | 30 runs/hour per routine; connectors are included and writable by default, so trim them | <https://code.claude.com/docs/en/routines> |
| CI-driven runs | `anthropics/claude-code-action@v1` with `prompt` + `claude_args` | Commits with the default `GITHUB_TOKEN` do not trigger CI | <https://code.claude.com/docs/en/github-actions> |
| Guardrails the agent can't loosen | **Managed settings**: `allowManagedHooksOnly`, `allowManagedPermissionRulesOnly`, `disableBypassPermissionsMode` | Beat project and `--settings` values | <https://code.claude.com/docs/en/managed-settings> |
| Blast radius | **Sandbox** (`sandbox.enabled`, `failIfUnavailable`, network allowlist) | Bash only; file tools, MCP and hooks run outside it | <https://code.claude.com/docs/en/sandboxing> |
| Not usable here | **Agent teams** | Experimental; teammates don't spawn in `-p`/SDK | <https://code.claude.com/docs/en/agent-teams> |

Anthropic's own long-running pattern (<https://anthropic.com/engineering/effective-harnesses-for-long-running-agents>): an *initializer* session turns the spec into a JSON feature list (all failing), an `init.sh` and a progress log; each *coding* session takes one feature, tests it end-to-end (browser automation, since unit tests and curl missed real failures), flips only its `passes` field, and commits. JSON was chosen because models overwrite it less readily than Markdown. Git commits, not checkpoints, are the rollback point (checkpoints don't track Bash side effects).

### Two ways to build it here

**A. Stay on bb (recommended).** bb already gives the spine: `kit-issue.js` is a workflow with Lead → Engineer → gate → cross-model Reviewer → gate, a run log and an audit receipt. Add a **Validator** phase that reads holdout scenarios from a path the Engineer's worktree never contains, `scripts/satisfaction.mjs` as its gate, and a bb schedule for dispatch. Inside each Engineer thread, ship a Stop hook (`node scripts/verify.mjs --changed` must be green before the agent may stop) and a PreToolUse deny on test/scenario paths, both in `.claude/settings.json` so bb's `claude-code` provider picks them up. Known bb limit: every worker runs on the starting thread's machine, so the harness needs Postgres and the twins *in the container*.

**B. Pure Claude Code.** A Routine (or GitHub Action on cron) per dispatch tick → `claude -p` running a `.claude/workflows/kit-issue` workflow with the same phases, guarded by managed settings. Gains: no own machine. Loses: bb's run log, audit receipt, machine routing and the per-day cap enforcement already built and ADR'd (0052–0059). Only worth it if bb itself becomes the bottleneck.

## 6. Risks and costs to grill

- **Cost.** StrongDM's $1k/engineer/day is not a KitCollective number. A realistic target is to measure tokens per landed slice first (the run log already records usage per thread) and set the budget from that.
- **Accountability.** Auth, IAP and personal data still get no human reading. Mitigation: keep a human gate on paths under `apps/api/**/auth/**` and IAP via `write-scope`, or require a satisfaction threshold of 1.0 there.
- **Scenario rot.** Holdouts go stale like specs. They need an owner and a review cadence, which is human work by design.
- **CONTEXT.md first.** "Scenario", "Satisfaction", "Validator" and "Digital twin" are new domain terms; per `AGENTS.md` they go into `CONTEXT.md` before any code uses them, and the merge-without-human change needs an ADR superseding the relevant part of ADR-0057/0058.
