# The bb-harness machine and the kit-issue run

How the isolated machine that runs `kit-issue` is set up, and how a run is started. This page is a summary of facts that live elsewhere (`.cursor/skills/bb-orchestrate/SKILL.md`, `docs/adr/0058-kit-issue-workflow-and-the-first-run-fixes.md`); when they disagree with this page, they win and this page is stale. Values below were read from inside the container on 2026-10-12; re-read them with the command beside each before relying on them.

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
| Capabilities dropped | `CapPrm`, `CapEff` and `CapBnd` all zero, `NoNewPrivs: 1` | `grep -E "^Cap|NoNewPrivs" /proc/self/status` |
| Memory cap | 2147483648 bytes (2 GiB) | `cat /sys/fs/cgroup/memory.max` |
| Process cap | 512 | `cat /sys/fs/cgroup/pids.max` |
| No Postgres | no `psql` or `postgres` binary | `which psql postgres` |
| No simulator | Linux, so no iOS Simulator, no Maestro device run | `uname -s` |

What the missing pieces mean in practice:

- **No Postgres.** The `api` and `db` suites cannot run. `node scripts/verify.mjs --changed --capability <what this machine has>` skips them and ends `INCOMPLETE` (exit 3), which is never green. Route a slice whose tests need a database to the Mac.
- **No simulator.** Device flows (`docs/agents/device-flows.md`) stay on the Mac.

## Secrets

- The names are listed in `bb.env` (names only, safe to commit): `GH_TOKEN`, `LINEAR_API_KEY`, `OPERATOR_EMAIL`. Add a name there only when something reads it.
- The values live in the main checkout's gitignored `.env`, mode 0600. They get there through one command, run from a bb thread on that machine:

  ```bash
  bb secret request GH_TOKEN LINEAR_API_KEY OPERATOR_EMAIL --write-env /home/node/work/kit-collective/.env
  ```

  It opens a secure form for the person; the values are typed into that form and never pass through the chat, a prompt or a command line. Existing assignments in the file are preserved.
- Posting the `kc/audit` status needs "Commit statuses: Read and write"; the `kit-issue` run never posts it (the receipt runs only as a dry run), so the person who merges asks for that permission when they need it.
- Nothing on this page, in a prompt or in a thread message carries a value. If a run needs a new secret, add its name to `bb.env` and request it with the command above.

## Updating the clone

The main clone is updated with the existing safe sync, not with a second procedure: `.cursor/skills/sync-development/SKILL.md`, or `bash scripts/sync-development.sh` from the main checkout's root. It fetches, fast-forwards the integration lane with `--ff-only` and stops when the branches diverge. Run it in the main checkout (`/home/node/work/kit-collective`), not in a run worktree, before starting a run, so the workflow file and the gate scripts are current.

## Validate and start a run

Both commands run from a bb project thread on the machine (`bb project list` shows the project, `kit-collective`):

```bash
bb workflows validate --file .bb/workflows/kit-issue.js
bb workflows run --file .bb/workflows/kit-issue.js --args '{"issue":"KIT-n"}'
```

`validate` is read-only; run it after every change to the workflow file. `run` returns at once and starts a real run of the issue: do not use it as a test of the command, it would start a second run.

The args are the `meta.inputSchema` of `.bb/workflows/kit-issue.js`:

| Arg | Meaning |
| --- | --- |
| `issue` | Required. The issue key, `KIT-n`. |
| `resume` | `true` to continue an issue that already has a branch and a PR. |
| `skipLead` | `true` to skip the Lead, for a small issue. |
| `maxRounds` | Fix rounds after a red review, 1 to 3, default 2. |
| `machine` | Only written to the run log; it routes nothing. |

The run goes from the session check to `Approval` and stops there (ADR-0058). `Approval` is not merge permission: a person moves the issue to `Merging` and starts the land step.

## What the workflow cannot do

- **No per-agent machine.** bb gives a workflow worker no machine, worktree or visibility option; every worker (Lead, Engineer, Reviewer, runners) runs in the environment of the thread that started the run. A run started on the container runs entirely there, so a slice that needs the Mac or Postgres cannot be split. The routing table in `.cursor/skills/bb-orchestrate/SKILL.md` applies to hand-driven runs only.
- **Gate results are not merge-grade.** The exit codes and verdict lines of `scripts/gate.mjs` reach the workflow through a runner model that relays them. A relayed result is as reliable as that model. Before any merge a person re-runs `node scripts/gate.mjs review <pr> --issue KIT-n` and the audit receipt themselves.
- **It never merges.** It writes only `In Progress`, `In Review`, `Approval` and `Blocked`, runs no merge lock and no land step, and runs the receipt only as a dry run.

The reasoning, and the other limits (self-reported thread ids, the model pairing, what was never verified against real threads), are in `docs/adr/0058-kit-issue-workflow-and-the-first-run-fixes.md`; who writes the run log is `docs/adr/0052-the-run-log-is-central-and-written-by-the-orchestrator-only.md`.
