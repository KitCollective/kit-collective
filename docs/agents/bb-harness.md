# The bb-harness machine and the AFK developer run

How the isolated machine that runs the AFK developer (`afk-developer`) is set up, and how a run is started. This page is a summary of facts that live elsewhere (`.cursor/skills/bb-orchestrate/SKILL.md`, `docs/adr/0058-kit-issue-workflow-and-the-first-run-fixes.md`); when they disagree with this page, they win and this page is stale. Values below were read from inside the container on 2026-10-12; re-read them with the command beside each before relying on them.

## What the machine is

- A Docker container named `bb-harness` on the Hetzner host, enrolled in bb as machine `host_new78xp362` (`bb machine list`). Identify it by that host id, not by hostname: the container's hostname changes when it is rebuilt.
- The image is built from a Dockerfile with Node 22, pnpm 9.15.4 and a gh that meets the requirement below, plus git, python3 and jq. That Dockerfile is not in this repo (the root `Dockerfile` is the API image, `seed/coolify/` holds the seed images); keep it next to wherever the container is run.
- The main clone is at `/home/node/work/kit-collective`.
- The owner's Mac is the other machine (`host_kttknna49n`). Work that needs a simulator or Postgres stays there.

### The gh requirement

The harness needs a gh whose `pr checks` subcommand supports `--json`. This is a capability, not a version: `gh pr checks --help` must list `--json`. No minimum version is claimed, because the first release with `--json` was never established.

- Known good: 2.102.0 (the container today).
- Known bad: 2.23.0 (no `--json`).

`scripts/wait-for-checks.mjs` probes this at startup and ends with exit 5 and a verdict line naming the cause when the gh is too old (`scripts/lib/pr-checks.mjs` holds the wording). Do not retry exit 5; replace the gh.

## Limits

| Limit | Observed | Read it with |
| --- | --- | --- |
| Not root | uid 1000, user `node` | `id` |
| Capabilities dropped | `CapPrm`, `CapEff` and `CapBnd` all zero, `NoNewPrivs: 1` | `grep -E "^Cap\|NoNewPrivs" /proc/self/status` |
| Memory cap | 2147483648 bytes (2 GiB) | `cat /sys/fs/cgroup/memory.max` |
| Process cap | 512 | `cat /sys/fs/cgroup/pids.max` |
| No Postgres | no `psql` or `postgres` binary | `which psql postgres` |
| No simulator | Linux, so no iOS Simulator, no Maestro device run | `uname -s` |

What the missing pieces mean in practice:

- **No Postgres.** The `api` and `db` suites cannot run. `node scripts/verify.mjs --changed --capability <what this machine has>` skips them and ends `INCOMPLETE` (exit 3), which is never green. Route a slice whose tests need a database to the Mac.
- **No simulator.** A slice's Device flow runs on a GitHub macOS runner instead (`node scripts/request-device-flows.mjs`, ADR-0059), so a mobile slice no longer needs the Mac. The local `device-run.sh`, with its before/after comparison, stays on the Mac (`docs/agents/device-flows.md`).

## Secrets

- The names are listed in `bb.env` (names only, safe to commit): `GH_TOKEN`, `LINEAR_API_KEY`, `OPERATOR_EMAIL`. Add a name there only when something reads it.
- The values live in the main checkout's gitignored `.env`, mode 0600. They get there through one command, run from a bb thread on that machine:

  ```bash
  bb secret request GH_TOKEN LINEAR_API_KEY OPERATOR_EMAIL --write-env /home/node/work/kit-collective/.env
  ```

  It opens a secure form for the person; the values are typed into that form and never pass through the chat, a prompt or a command line. Existing assignments in the file are preserved.
- Posting the `kc/audit` status needs "Commit statuses: Read and write"; the AFK developer run never posts it (the receipt runs only as a dry run), so the person who merges asks for that permission when they need it.
- The same `GH_TOKEN` reads the Holdout repo: `docs/agents/scenarios.md` has the format, the CLI and the command that proves a machine's read.
- Nothing on this page, in a prompt or in a thread message carries a value. If a run needs a new secret, add its name to `bb.env` and request it with the command above.

## Updating the clone

The main clone is updated with the existing safe sync, not with a second procedure: `.cursor/skills/sync-development/SKILL.md`, or `bash scripts/sync-development.sh` from the main checkout's root. It fetches, fast-forwards the integration lane with `--ff-only` and stops when the branches diverge. Run it in the main checkout (`/home/node/work/kit-collective`), not in a run worktree, before starting a run, so the workflow file and the gate scripts are current.

## Validate and start a run

Both commands run from a bb project thread on the machine (`bb project list` shows the project, `kit-collective`):

```bash
bb workflows validate --file .bb/workflows/afk-developer.js
bb workflows run --file .bb/workflows/afk-developer.js --args '{"issue":"KIT-n"}'
```

The path is the thread's own worktree copy: bb refuses a workflow file outside the thread's workspace ("Workflow scriptPath must stay inside the origin workspace"), so a thread cannot point at the main clone's file. The file is read when the run starts, so it must be current: a thread in a fresh worktree from `origin/development` is; a thread in an existing issue worktree merges `origin/development` into the branch and pushes before it starts the run. From that point on a stale copy stops itself: the run's first step compares the worktree's `scripts/`, `.bb/workflows/` and `factory.config.json` with `origin/development` and stops at `harness` when they differ (merge the lane into the branch and push, then run again). That stop does not count against the run cap. A branch older than that step has no such check, which is why the merge comes first.

`validate` is read-only; run it after every change to the workflow file. `run` returns at once and starts a real run of the issue: do not use it as a test of the command, it would start a second run.

The args are the `meta.inputSchema` of `.bb/workflows/afk-developer.js`:

| Arg | Meaning |
| --- | --- |
| `issue` | Required. The issue key, `KIT-n`. |
| `resume` | `true` to continue an issue that already has a branch and a PR. When the last Engineer result was `ready`, no findings are open on the head and the pre-review gate is open, the run goes straight to the Reviewer (round 0) and spends no Engineer round. |
| `skipLead` | `true` to skip the Lead, for a small issue. |
| `maxRounds` | Total Engineer rounds, 1 to 3, default 2: the first build plus one fix round after a red review. |
| `machine` | Only written to the run log; it routes nothing. |

| `autoLand` | `true` to hand a green issue to `scripts/auto-land.mjs` (ADR-0061) instead of stopping at `Approval`. Default false; without it the workflow only asks whether `flow.autoLand.enabled` is on. |

By default the run goes from the session check to `Approval` and stops there (ADR-0058). `Approval` is not merge permission: a person moves the issue to `Merging` and starts the land step. That human path is unchanged.

With auto-land on (the `autoLand` arg, or `flow.autoLand.enabled` in `factory.config.json`) the normal path ends at `Done` and `Approval` is the exception exit. After the dry-run receipt the workflow runs `node scripts/auto-land.mjs start <pr> --issue KIT-n --handoff`, which itself re-checks the PR, the issue, the risk class, the independent reviewer, the `kc/audit` receipt (it posts it, through `audit-receipt.mjs`), the review gate, the runaway ceiling and the circuit breaker, takes the merge lock, trial-merges the lane (a clean merge goes through; a conflict is refused), sets `Merging` and enqueues; then `auto-land.mjs finish` waits for the merge and the integration check and sets `Done`. A refusal, an ejected PR or a red integration check moves the issue to `Approval` with `ready-for-human` and a comment naming the cause. The workflow itself never posts a receipt, sets `Merging` or merges; only `auto-land.mjs` does, from inside its own checks (ADR-0061). It is shipped off.

**Switching auto-land on and off.** Any one stops it: the label `hold` on the issue; `touch .factory/auto-land.off` in the main checkout (delete the file to allow it again; it wins over everything); `flow.autoLand.enabled` false in `factory.config.json` and no `autoLand` arg. To turn it on for every run set `flow.autoLand.enabled` to true in the main checkout's `factory.config.json` (a PR cannot do it for itself: the script reads the main checkout's copy). `flow.autoLand.maxPerDay` (default 100) is only a runaway ceiling. The real brake is the circuit breaker: after `flow.autoLand.breakerAfter` (default 3) consecutive failed finishes `start` refuses with `breaker-open` until a person fixes the cause and runs `node scripts/auto-land.mjs reset`. Merges are serialised through the merge lock; a second `start` waits for it. `node scripts/auto-land.mjs start <pr> --issue KIT-n --dry-run` runs every check and changes nothing.

An issue gets at most `flow.maxRunsPerDay` runs (factory.config.json, 3) in 24 hours, resumes included: the session check refuses the next one and names the cap. Raising it is a committed change by a person, never something a run does for itself.

## Start Milestone scenarios

The second workflow on this machine, `.bb/workflows/milestone-scenarios.js` (ADR-0060), judges one finished milestone's Holdout Scenarios on the hosted iOS Simulator and sets the `Scenarios` commit status on the `development → staging` promotion PR. What it does, its subcommands and its errors: `docs/agents/scenarios.md`. Validate and start it the same way, from a bb project thread in a fresh worktree of `origin/development` (its harness check stops a stale copy as the AFK developer's does):

```bash
bb workflows validate --file .bb/workflows/milestone-scenarios.js
bb workflows run --file .bb/workflows/milestone-scenarios.js --args '{"project":"<Linear project>","milestone":"<Linear milestone>","pr":<promotion PR>}'
```

| Arg | Meaning |
| --- | --- |
| `project` | Required. The Linear project name, as in Linear (`Holdout Scenarios`). |
| `milestone` | Required. The Linear milestone name (`Fixture`). Both names may hold letters (accented ones too), digits, spaces and `. , : ( ) + _ / -`, start with a letter or digit, and are at most 80 characters; anything else (a quote, `$`, a backtick, a backslash, `!`) is refused, because the names sit in double quotes in a command. |
| `pr` | Required. The number of the open `development → staging` PR. |
| `machine` | Only written to the run log; it routes nothing. |

`run` starts a real run: it posts a commit status that everyone sees on the `development` tip and spends macOS minutes (runsPerScenario hosted runs per Scenario, at ten times the Linux rate), so it is a person's decision. The run refuses, posting nothing, unless every issue of the milestone is `Done` or `Canceled`, the PR is an open `development → staging` PR and the milestone has a Holdout file. It needs, on top of the AFK developer's: a `GH_TOKEN` that may dispatch workflows (`actions: write`) and write commit statuses (`statuses: write`), and reads the Holdout; and `ffmpeg` on the machine for the judge to see the recording (without it the judge judges from the screenshots). It can wait about 4 hours for the hosted runs.

### Promotion path

`Scenarios` is a required check on `staging`: ruleset `lane-staging` requires `test` and `Scenarios` and has no bypass actors, so no one (Nicklas included) can merge a promotion PR past a red or missing `Scenarios`. Undoing that is an edit of the ruleset by a person, never by an agent. The path for one milestone, in full in `docs/agents/automations.md` section 4:

1. Every issue of the milestone is `Done` or `Canceled`.
2. The `development → staging` promotion PR is open (a person opens or updates it today; the hourly opener is not wired).
3. A person starts Milestone scenarios (above) with the project, the milestone and the PR.
4. The Scenario judge posts `Scenarios` on the PR head. Red: the failed Scenarios go back through the issue flow (KIT-354), then a new run on the new head. Any push to `development` moves the head and needs a new run.
5. When `Scenarios` and `test` are green, a person merges. Never an agent, never auto-merge.

A milestone with no Holdout file gets no `Scenarios` (the run refuses), so it cannot promote. Satisfaction is reported, not the gate.

## What the workflow cannot do

- **No per-agent machine.** bb gives a workflow worker no machine, worktree or visibility option; every worker (Lead, Engineer, Reviewer, runners) runs in the environment of the thread that started the run. A run started on the container runs entirely there, so a slice that needs the Mac or Postgres cannot be split. The routing table in `.cursor/skills/bb-orchestrate/SKILL.md` applies to hand-driven runs only.
- **Gate results are not merge-grade.** The exit codes and verdict lines of `scripts/gate.mjs` reach the workflow through a runner model that relays them. A relayed result is as reliable as that model. That is why nothing is merged on a relayed result: either a person re-runs `node scripts/gate.mjs review <pr> --issue KIT-n` and the audit receipt themselves, or `scripts/auto-land.mjs` re-reads everything itself right before it enqueues (ADR-0061).
- **It never merges.** It writes only `In Progress`, `In Review`, `Approval` and `Blocked`, runs no merge lock and no land step, and runs the receipt only as a dry run. With `autoLand` on, `scripts/auto-land.mjs` does the merge steps; the workflow still names no merge command and no merge state.

The reasoning, and the other limits (self-reported thread ids, the model pairing, what was never verified against real threads), are in `docs/adr/0058-kit-issue-workflow-and-the-first-run-fixes.md`; who writes the run log is `docs/adr/0052-the-run-log-is-central-and-written-by-the-orchestrator-only.md`.
