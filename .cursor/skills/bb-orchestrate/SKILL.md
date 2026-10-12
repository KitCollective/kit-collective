---
name: bb-orchestrate
description: How the orchestrating /issue-session thread spawns lead, engineer and reviewer child threads with bb, routes them to a machine, and keeps the run log, gates and audit receipt. Use when /issue-session runs inside bb (BB_THREAD_ID is set) instead of Task sub-agents.
---

# Orchestrating an issue with bb threads

`/issue-session` is the pipeline; this file is how it runs when each step is a bb thread. Load `factory.config.json` then `WORKFLOW.md` first. The orchestrator is the human-started session: its invocation **is** approver-present merge permission (`issue-session`), and no child thread ever lands anything. Children never write the run log, never move Linear states except the workpad edits their role owns, and never merge.

Facts this relies on (verify with `bb project list`, `bb machine list` when in doubt):

| Thing | Value |
| --- | --- |
| bb project | `kit-collective` = `proj_rp846ybret` |
| Mac (owner's machine) | `host_kttknna49n` |
| Container `bb-harness` (Hetzner, isolated) | `host_new78xp362`: node 22, git, pnpm 9.15.4, gh 2.102.0 (`gh pr checks --json` is required; 2.23.0 lacks it, ADR-0058), python3, jq; repo at `/home/node/work/kit-collective` |
| Secrets | `GH_TOKEN`, `LINEAR_API_KEY` in the main checkout's gitignored `.env` (`bb secret request` needs a bb thread) |

## Machine routing (hand-driven runs; the kit-issue workflow cannot route, ADR-0058)

| Slice | Machine |
| --- | --- |
| Device-flow / Maestro / simulator / EAS | Mac `host_kttknna49n` |
| Anything whose tests need Postgres (`api`, `db` suites) | Mac, until the container has a database (open item below) |
| Backend without DB tests, admin, docs, factory scripts, ADRs | container `host_new78xp362` |
| Lead and reviewer threads | container (they read and run scripts only) |

The orchestrator itself runs on one machine; the run log, `.factory` cache and `merge-lock` caller live there. Everything cross-machine goes through Linear, GitHub and bb (the lock is a ref on origin, ADR-0054).

## Spawning a step

```bash
bb thread spawn --project proj_rp846ybret --machine <host> \
  --new-environment worktree --base-branch origin/development \
  --parent-self --visibility hidden --provider <provider> --model <model> \
  --title "<KIT-n> lead" --prompt "<brief>" --json
```

- `--parent-self` makes the child notify this thread when it finishes. Wait with `bb thread wait <id>` (default: idle) in the background; do not poll.
- Engineer on a later pass resumes on the same branch: pass `--environment <id>` of the first engineer thread instead of `--new-environment`.
- Read the result with `bb thread output <id> --json`. The step's last line is its result line (`LEAD-RESULT`, `AUDIT-RESULT`, the engineer's `ENGINEER-RESULT KIT-n ready|blocked|failed <sentence>`). A `blocked` (or Lead `stop`) sentence starting `needs-human:` → the orchestrator moves the issue to `Approval` with `needs-info` or `ready-for-human` and fills `### Waiting`; starting `blocked-by KIT-m:` → `node scripts/linear.mjs block <KIT-n> --by <KIT-m>`, then `Blocked`; `plan-approval` → `Approval` + `ready-for-human`. See `issue-session`. No line: `node scripts/gate.mjs result <TAG> <file>` exits `1`; log `reason --code no-result-line` and run the gate yourself (ADR-0053).
- **A thread that went idle without a result line** (the Engineer ending its turn on a background CI wait, KIT-337) is re-prompted **once**: `bb thread tell <id> "You ended without a result line. Wait for CI in the foreground with wait-for-checks --timeout 480 (repeat it on exit 2, up to 5 times), then end with ENGINEER-RESULT <KIT-n> ready|blocked|failed <sentence> as the last line."` and `bb thread wait <id>` again. Log `reason --code no-result-line` first. A second silent idle is not re-prompted: run the gate yourself and treat the step as `blocked` (ADR-0058). The `kit-issue` workflow does this structurally, because every step returns through a result schema.
- Models: the start decision gives an alias (`opus`, `sonnet`). The lead always gets the strong one. A reviewer on a different model than the engineer is recommended, not required: bb's thread record has no model field, so the model is the one you pass to `--model` at spawn and write to the run log; the receipt reads provider and model from there. Always log `spawn` for the engineer and the reviewer with `--thread`, `--provider` and `--model` (`run-log.mjs` refuses an engineer or reviewer spawn without all three; only the lead may omit them), because the receipt refuses a reviewer thread that has no `spawn reviewer` event and a thread that is one of the issue's engineer threads.
- Prompts name the issue key and the role file (`.cursor/agents/lead.md`, `.cursor/skills/implement/SKILL.md`, `.cursor/skills/code-review/SKILL.md`); they never contain secrets.

## The flow

1. `node scripts/session-check.mjs <KIT-n>`: refuse a second run. Then `run-log.mjs start`.
2. `node scripts/start-decision.mjs` over the issue → plan or not, Roles, engineer model.
3. **Lead** thread (if plan): `run-log.mjs spawn --step lead --thread <id> --provider <p> --model <m> --machine <host>`; on idle read the result, `run-log.mjs result --outcome plan|plan-approval|stop --usage-thread <id>`.
4. **Engineer** thread on the routed machine: reads `### Plan`, builds with `/tdd` and Roles, opens the PR, passes the pre-review gate. Log spawn and result.
5. `node scripts/gate.mjs pre-review <pr> --issue <KIT-n>` and `node scripts/head-changed.mjs <KIT-n> --pr <pr>`. The pre-review gate never reads the matrix: no reviewer has written one yet.
6. **Reviewer** thread (hidden, fresh context, preferably another model): runs `/code-review`, writes the matrix into the workpad, ends with `AUDIT-RESULT KIT-n green|amber|red <head-sha> [failing,rows]` as its **final line**, with nothing after it (the receipt accepts only the last non-empty line). Then **the orchestrator runs** the full gate `node scripts/gate.mjs review <pr> --issue <KIT-n>` (it validates the matrix the reviewer wrote), and only on exit `0` `node scripts/audit-receipt.mjs post <pr> --thread <reviewer> [--require-different-model]`; add the flag when you want the run log's reviewer model to differ from the engineer's. Posting the status needs a token with "Commit statuses: Read and write"; with only Read the script ends `UNKNOWN (receipt): token lacks Commit statuses write` and the human raises the permission (ask for it, never change tokens yourself). The script, not prose, posts `kc/audit` and logs the audit. Red: fix loop (a new engineer pass, replan rules in `issue-session`).
7. Pass → `Approval` (skipped when the auto label applies) → `Merging` (this session, approver-present) → `merge-lock.mjs wait`, `sync-pr.mjs sync` (then `merge-lock.mjs take` again to renew), `/land`; when the PR is `MERGED` the issue is `Post-Merge` (Linear's GitHub automation, or you), then `gate.mjs land`: exit `0` → `Done`, otherwise it stays `Post-Merge`; `merge-lock.mjs release`, reap.
8. `node scripts/verify.mjs --changed --capability <what this machine has>` where a verify per head is wanted: `INCOMPLETE` (exit 3) is not green, `NOTHING TO DO` (exit 4: `--changed` matched no suite and no global path) is not a pass either, and a dirty run says `VERIFY OK (dirty: not for <sha8>)`: it is not a result for the commit.

## Open items (do not fix from here)

- **No database on the container.** `api` and `db` suites need Postgres; there `verify.mjs` skips them and reports `INCOMPLETE`. Route DB-test slices to the Mac until a Postgres sidecar exists on the server.
- **bb exposes no token usage** in `bb thread show --json`; the run log records null and the report prints `n/a`.
- **Receipt is provenance, not unforgeability** (bb has no SubagentStop hook): ADR-0056.
- Not yet exercised with a real multi-thread run.

## The kit-issue workflow

`bb workflows run --file .bb/workflows/kit-issue.js --args '{"issue":"KIT-n"}'` (ADR-0058) runs steps 1 to 6 above without a hand-driving orchestrator and stops at `Approval`. It never sets `Merging`, never merges and runs the receipt only as `--dry-run`; steps 7 and 8 stay yours. It cannot route a machine or a worktree per step: every worker, the Reviewer included, runs in the environment of the thread that started it, so the machine routing table above applies to hand-driven runs only, and a slice that needs the Mac is not split by it. Its gate results come through a runner model and are not merge-grade until ADR-0058's Decision 2 is settled. **A foreground command in a claude-code thread is capped at 10 minutes (600 s)**, so every wait runs in slices: `--timeout 480`, repeated while the verdict is waiting (gate exit 3, wait-for-checks exit 2), at most 5 slices (about 40 minutes). The Engineer does the same in its own turn and only ends `blocked ci-pending` after the bound. wait-for-checks exit `5` means gh is unusable and is never retried. Runner workers run the scripts; the Lead, Engineer and Reviewer are separate hidden workers.
