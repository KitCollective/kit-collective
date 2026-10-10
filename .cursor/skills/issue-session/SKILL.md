---
name: issue-session
description: Desktop pipeline for one Linear issue or a batch — Implementing, isolated code-review with a fix loop, then land. Sequential or parallel.
disable-model-invocation: true
---

# Issue session start

Load `factory.config.json` then `WORKFLOW.md`. Resolve names from [../_shared/factory.md](../_shared/factory.md). If `linear.setup.json` is missing, stop and run `/bootstrap-linear`.

Run the **pipeline** on the issues the human named: implement until the pre-review gate is clean, **fresh review** in an isolated sub-agent, **fix the class** when review returns work, then land into `lanes.integration`. A **batch** is several identifiers in one invocation — sequential or parallel.

This skill is Desktop / Cloud Agent. It is not PI-worker dispatch and does not set Linear Agent to Cursor.

## Factory twist

- Follow [implement/SKILL.md](../implement/SKILL.md) by reading it. Do not slash-invoke `/implement` (user-invoked skills cannot fire each other).
- Invoke `/code-review` only inside a **fresh** Task sub-agent (empty conversation, judge only). That isolation is the Desktop stand-in for checker’s fresh VM. The parent never treats its own reading of the diff as the pass verdict.
- Invoke `/land` after this session has moved the issue to `Merging`. Human invocation of this skill **is** approver-present merge permission for the named issues. Still merge only into `lanes.integration`. Never staging or production.
- Status names come from factory config. Do not invent states.
- `/tdd`, `/signal-up`, `/diagnosing-bugs`, `/codebase-design` may run from inside the implement follow-through (model-invoked).

## Inputs

From the human message, collect:

1. **Identifiers** — `<teamKey>-n` tokens (one or a **batch**). If none, ask once.
2. **Batch mode** — `parallel` only when the human said parallel / samtidigt. Otherwise **sequential**.
3. **Order** — if the human listed identifiers in order, keep that order. Otherwise `dispatch.priorityOrder`, oldest first at the same rank.

## Guardrails (every issue)

Stop on that identifier (do not mutate it) when any of these hold. Continue the rest of the **batch**.

- Label `signal-up`, `ready-for-human`, `needs-info`, or `wontfix`
- Status is Linear Triage, Duplicate, Canceled, or Done
- Unresolved `blockedBy` (unless the blocker is also in this **batch** and will finish first — sequential only)
- Linear Agent is Cursor (Cloud Agent path — skip and role-comment)
- Status is `Parked` unless the human named that identifier explicitly

Write-scope overlap and fan-out: [references/batch.md](references/batch.md).

## Pipeline (one issue)

Completion: Linear status is `Done` and the PR SHA is on `origin/<lanes.integration>`, **or** the issue is stopped under Guardrails / loop cap with a role comment.

### 0. Session check

`node scripts/session-check.mjs <KIT-n>` (add `--resume` when the human said to continue, and also when the human names an issue that is already `Implementing` and no live run exists: no open PR, no remote branch hit, no `start` in the run log inside the live window. Run it first without `--resume`; if the only reason for refusal is the claimed state, rerun with `--resume`). Exit `0` go on; `1` stop on this identifier, the line says why (open PR, remote branch, claimed state, a run in the last 30 minutes, a stop label). It reads Linear, GitHub and the run log, never local worktrees, so it holds across machines.

### 1. Load

`get_issue` **and** `list_comments` — from the workspace in `factory.config.json`, nowhere else. In Claude Code, or whenever a Linear MCP answers “not found” for the issue, use `node scripts/linear.mjs issue <KIT-n>` (one call returns labels, `blockedBy` and comments) and its `comment` / `state` / `label` / `description` / `link` commands for every later Linear write. It finds the key itself and checks the workspace; do not read `.env`, and do not stop to ask for a key. Workpad is the single `agent.workpadHeading` comment. Attached PR → also GitHub review comments.

### 2. Claim

If status is `dispatch.state`, labelled `ready-for-agent`, unblocked, and Agent empty: move to `Implementing`, one planner-style role comment. Assignee stays the human.

If status is already `Implementing` with `ready-for-agent`: start or resume. Same branch, same PR.

If status is `In Review`, `Ready for merge`, or `Merging`: join at the matching step below (review, approve+land, or land).

### 2a. Lead (start)

Log the run: `node scripts/run-log.mjs start --issue <KIT-n>` (the orchestrator is the only writer of the run log, ADR-0052).

Decide with rules, not a service: `node scripts/start-decision.mjs --red-audits <n> [--replan] < issue.json` (`{ body, labels }`; `startDecision` in `scripts/lib/start-decision.mjs`) prints one JSON line with `plan`, `roles`, `engineerModel`. Spawn the **lead** (`.cursor/agents/lead.md`, strong model) in a fresh Task sub-agent with the issue id, mode `start` and that decision. It writes `### Plan` in the workpad and returns `LEAD-RESULT <KIT-n> plan|plan-approval|stop <sentence>`. `plan-approval` and `stop` end this issue's run with a role comment (a person approves or fixes); `plan` goes on. A resumed issue whose workpad already has `### Plan` skips the lead. Log the spawn and result: `node scripts/run-log.mjs spawn --issue <KIT-n> --step lead --thread <id> --mode start` and `result --issue <KIT-n> --step lead --outcome plan`. A Task sub-agent has no thread id: omit `--thread`, but still log the `spawn`, because the report counts an issue as "with lead" from that line. The lead is spawned at start and at replan, never by the implementer.

### 3. Implement

Follow [implement/SKILL.md](../implement/SKILL.md), which **reads** `### Plan` instead of planning, through the pre-review gate. Move to `In Review` only when that gate is true. One implement → In Review role comment. Do not merge. Do not tick description Acceptance criteria.

### 4. Fresh review

Run the whole gate in one call: `node scripts/gate.mjs review <pr> --issue <KIT-n>`. It folds `pnpm check:review-gate`, the matrix validation, the PR write-scope check and `wait-for-checks` into one verdict line and logs it. Exit `0` open, `1` closed (fix the named step), `3` waiting (checks pending, run again), `4` unknown (retry once, then ask). Run it from the PR's worktree: when HEAD is not the PR head it exits `4` (`run this gate from the PR's worktree`). Mechanical steps run first and the wait for checks only when they are clean. Before a reviewer is spawned run `node scripts/head-changed.mjs <KIT-n> --pr <pr>` (the head comes from GitHub, never from the cwd): exit `1` means this head was already audited red; change the code first.

The single steps, when you need one alone: `pnpm check:review-gate`. Red → fix it and stay in step 3; a review never sees what a script can say.

Then wait for the required checks yourself: `node scripts/wait-for-checks.mjs <pr>` (ADR-0050). It is the one sanctioned wait; the ratchet hook denies the watch flag, sleeps and loops. Run it in the background when other work is left, in the foreground otherwise. Exit `0` go on, `1` red (fail, below), `3` behind or conflicting (rebase, rerun), `2` or `4` retry once, then ask. **Never ask the human whether CI is green, and never stop to wait for a build.**

Spawn one Task (`subagent_type` `generalPurpose` or `bugbot` only if the human asked Bugbot). Prompt: read `.cursor/skills/code-review/SKILL.md` and run it on this issue’s PR / merge-base diff, with the workpad's `### Review matrix` and `lastReviewSha` when there is one. Return every hard finding; do not stop at three. The sub-agent writes the matrix; the parent runs `node scripts/review-matrix.mjs validate` on it before taking a verdict.

Parent aggregates:

- Hard Spec or Standards findings, red required checks, or `CONFLICTING` → **fail**.
- Both axes clean, `MERGEABLE`, required checks green → **pass**.

### 5. Fix loop (fail)

**Light fail first.** When every finding is tagged `[text]` or `[name]` and the checks are green: stay `In Review`, fix in place, run `node scripts/classify-fix-diff.mjs <lastReviewSha>`. `light` → read that diff against each finding (a Task that sees only the fix diff and the findings, not a three-axis review), rerun `pnpm check:review-gate`, update the matrix rows the fix touched, `lightFixes` +1, one role comment, then step 6. `reviewLoops` unchanged; the third light fix on one issue counts as one `reviewLoops`. `full` → the tag was wrong: continue below as a normal fail.

Otherwise move to `Implementing`. Write the **full** set under workpad `### Review feedback` (file/criterion + what done looks like). One checker-style role comment with axis headings. Increment the checker-fail side of `### Loop counters`.

**Replan.** When the feedback shows the plan itself was wrong (wrong file split, a missing Role, a path outside the write-scope) or the implementer recorded a plan conflict under `### Notes`, spawn the lead again with mode `replan` and the `### Review feedback`, log `reason --code replan`, and run the implementer on the strong model (`startDecision` with `replan: true`). Otherwise the lead is not spawned again.

Log every verdict: `node scripts/run-log.mjs audit --issue <KIT-n> --verdict green|amber|red --round <n> --sha <head> [--rows <failing matrix rows>]`, and a `reason` per failing cause with a fixed code (`scripts/lib/run-log.mjs` `REASON_CODES`). Report with `node scripts/run-log.mjs report`.

Then resume implement: **fix the class**, not the cited file. Re-run the pre-review gate. Return to step 4.

Stop the issue (leave `Implementing`, role-comment) when checker-fail returns hit five, or CI-fail cycles hit five (`WORKFLOW.md` loop cap). Do not land.

### 6. Pass

`Ready for merge`. Tick description Acceptance criteria `[x]`. One checker-style verdict comment per criterion. Clear addressed `### Review feedback`.

### 7. Land

Take the merge queue lock first: `node scripts/merge-lock.mjs wait <pr>` (background; exit `0` taken). It is a ref on origin, so it holds across machines (ADR-0054). Then `node scripts/sync-pr.mjs sync <pr>` from the PR's worktree: `CURRENT` or `SYNCED` go on (after `SYNCED` wait for the required checks again), `CONFLICT` goes back to the implementer, `CLOSED` stops. A review pass stays valid after `SYNCED`: `node scripts/sync-pr.mjs valid <audited-sha>` says `AUDIT-VALID` when only clean merges of `<lanes.integration>` were added. Release the lock when land has ended either way: `node scripts/merge-lock.mjs release <pr>`. Never rebase after the PR is open, and never rewrite a pushed branch.

Move to `Merging` (approver-present). Follow [land/SKILL.md](../land/SKILL.md) and [land/references/merge.md](../land/references/merge.md). Success → run `node scripts/gate.mjs land <pr> --issue <KIT-n>`: only exit `0` (PR merged, merge commit on `origin/<lanes.integration>`, checks on that commit green) allows `Done` + role comment with merge SHA; `3` waits and reruns, `1` is a merge fail. Merge fail → `Implementing` + merge error under `### Review feedback` + increment `reviewLoops` + resume from step 3.

### 8. Reap worktree

After land success, follow [reap-worktree/SKILL.md](../reap-worktree/SKILL.md): verify the branch is on `origin/<lanes.integration>`, remove the issue worktree, delete the merged remote branch when safe.

## A step that returns no result line

When a spawned step ends without its result line (`LEAD-RESULT`, `AUDIT-RESULT`, the lander's), `node scripts/gate.mjs result <TAG> <file>` exits `1` (`NO-RESULT`). Log `reason --code no-result-line`, then run the gate for that step yourself (`gate.mjs review` or `land`) and go by its exit code. Never take a silent step for a pass.

## Running inside bb

When `BB_THREAD_ID` is set, each step is a child thread: follow [bb-orchestrate/SKILL.md](../bb-orchestrate/SKILL.md) for machine routing, spawning, and the audit receipt (`node scripts/audit-receipt.mjs post <pr> --thread <reviewer>`, ADR-0056), which replaces the in-session Task sub-agent as the proof that a fresh review ran. `node scripts/verify.mjs --changed` (ADR-0055) runs the suites a change touches and reuses green ones; `INCOMPLETE` is not green.

## Run log

Every issue leaves lines in the central run log (`flow.runLog` in `factory.config.json`, default file `run-log.jsonl` in the gitignored `.factory` folder of the main checkout): `start`, `spawn`, `result` (with provider, model and tokens when `bb thread show --json` exposes them, else null), `audit`, `reason`. Only this orchestrating session writes it. `node scripts/run-log.mjs report` compares issues with and without a lead by review rounds and tokens (ADR-0051, ADR-0052).

## After the batch

List each identifier: landed SHA, worktree reaped (yes/no), still in loop, skipped (reason), or blocked. Do not start unnamed issues.
