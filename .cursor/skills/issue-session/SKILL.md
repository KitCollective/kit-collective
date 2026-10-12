---
name: issue-session
description: Desktop pipeline for one Linear issue or a batch — In Progress, isolated code-review with a fix loop, then land. Sequential or parallel.
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

At queue-build time, a `Blocked` issue whose blockers are **all** `Done` or `Canceled` is moved to `To-do` first (`node scripts/linear.mjs state <KIT-n> "To-do"`); `session-check` says `move it to To-do first`. A `Blocked` issue with an unresolved blocker is skipped.

## Guardrails (every issue)

Stop on that identifier (do not mutate it) when any of these hold. Continue the rest of the **batch**.

- Label `signal-up` or `wontfix` (hard stops in every state). `needs-info` / `ready-for-human` stop the issue while it is in `Approval` (or Backlog, Triage, a working stage); in `To-do` they mean the human answered, and `session-check` says `answered: swap ... ready-for-agent`
- Status is Linear Triage, Duplicate, Canceled, or Done
- Unresolved `blockedBy` (unless the blocker is also in this **batch** and will finish first — sequential only)
- Linear Agent is Cursor (Cloud Agent path — skip and role-comment)
- Status is `Blocked` and a blocker is not `Done`: it resumes only when its blockers are Done (`session-check` says which)
- Status is `Approval`: it waits for a human, not for the flow (`session-check` is closed on `needs-info` / `ready-for-human` there)

Write-scope overlap and fan-out: [references/batch.md](references/batch.md).

## Pipeline (one issue)

Completion: Linear status is `Done` (set only after `gate.mjs land` is open) and the PR SHA is on `origin/<lanes.integration>`, **or** the issue is stopped under Guardrails / loop cap with a role comment.

### 0. Session check

`node scripts/session-check.mjs <KIT-n>` (add `--resume` when the human said to continue, and also when the human names an issue that is already `In Progress` and no live run exists: no open PR, no remote branch hit, no `start` in the run log inside the live window. Run it first without `--resume`; if the only reason for refusal is the claimed state, rerun with `--resume`). Exit `0` go on; `1` stop on this identifier, the line says why (open PR, remote branch, claimed state, a run in the last 30 minutes, a stop label). It reads Linear, GitHub and the run log, never local worktrees, so it holds across machines.

### 1. Load

`get_issue` **and** `list_comments` — from the workspace in `factory.config.json`, nowhere else. In Claude Code, or whenever a Linear MCP answers “not found” for the issue, use `node scripts/linear.mjs issue <KIT-n>` (one call returns labels, `blockedBy` and comments) and its `comment` / `state` / `label` / `description` / `link` commands for every later Linear write. It finds the key itself and checks the workspace; do not read `.env`, and do not stop to ask for a key. Workpad is the single `agent.workpadHeading` comment. Attached PR → also GitHub review comments.

### 2. Claim

If status is `dispatch.state`, labelled `ready-for-agent`, unblocked, and Agent empty: move to `In Progress`, one planner-style role comment. Assignee stays the human.

If status is already `In Progress` with `ready-for-agent`: start or resume. Same branch, same PR.

If the issue was in `Approval` waiting for a human and the human answered by moving it to `To-do`, it carries `needs-info` / `ready-for-human` and has no `ready-for-agent`, so it is not auto-dispatchable: it resumes only when a human-started session names it. `session-check` returns OPEN with `answered: ...`. On claiming it, swap the label back (`node scripts/linear.mjs label <KIT-n> swap needs-info ready-for-agent`, or from `ready-for-human`), write `Resumed: <date>` under `### Waiting`, and only then proceed, resuming from the workpad with `--resume` at the stage `### Waiting` names. Any answer goes back to `To-do`, never to a specific stage. `ready-for-agent`, `needs-info` and `ready-for-human` share Linear's single-select Triage label group (checked read-only: `groupType` is `singleSelect`), so a plain `label add` is rejected and the dispatch label would be lost. Use one atomic swap together with the state move: stop = `node scripts/linear.mjs label <KIT-n> swap ready-for-agent needs-info` (or `ready-for-human`) and `state <KIT-n> Approval`; resume (claim) = `label <KIT-n> swap needs-info ready-for-agent` (or from `ready-for-human`), then write `Resumed: <date>` under `### Waiting`.

If status is `In Review`, `Approval` (with neither `needs-info` nor `ready-for-human`), or `Merging`: join at the matching step below (review, approve+land, or land). `Approval` is cross-stage (ADR-0057): it also holds an issue that waits for a human mid-flow. `needs-info` = a question, `ready-for-human` = a yes/no decision or permission; neither = review green, the approver may merge. Only the move to `Merging` is merge permission.

**Result lines that stop a step.** An Engineer or Lead result `blocked` (or `plan-approval`) is read by its sentence: `needs-human: <what is asked>` → move the issue to `Approval` with `label <KIT-n> swap ready-for-agent needs-info` (a question) or `... ready-for-human` (a decision or permission), and fill workpad `### Waiting` (what is asked, the stage it came from, `Asked: <date>`); `plan-approval` → `Approval` + `ready-for-human` (same swap); `blocked-by KIT-m: <why>` → relate it with `node scripts/linear.mjs block <KIT-n> --by <KIT-m>` and move it to `Blocked`. A dependency the agent discovers is filed first with `/signal-up` (it lands in Triage, the owner accepts it), then `block`. `Blocked` needs an unresolved `blockedBy`; if a person is needed it is `Approval`.

### 2a. Lead (start)

Log the run: `node scripts/run-log.mjs start --issue <KIT-n>` (the orchestrator is the only writer of the run log, ADR-0052).

Decide with rules, not a service: `node scripts/start-decision.mjs --red-audits <n> [--replan] < issue.json` (`{ body, labels }`; `startDecision` in `scripts/lib/start-decision.mjs`) prints one JSON line with `plan`, `roles`, `engineerModel`. Spawn the **lead** (`.cursor/agents/lead.md`, strong model) in a fresh Task sub-agent with the issue id, mode `start` and that decision. It writes `### Plan` in the workpad and returns `LEAD-RESULT <KIT-n> plan|plan-approval|stop <sentence>`. `plan-approval` and `stop` end this issue's run with a role comment (a person approves or fixes); `plan` goes on. A resumed issue whose workpad already has `### Plan` skips the lead. Log the spawn and result: `node scripts/run-log.mjs spawn --issue <KIT-n> --step lead --thread <id> --mode start` and `result --issue <KIT-n> --step lead --outcome plan`. A Task sub-agent has no thread id: omit `--thread`, but still log the `spawn`, because the report counts an issue as "with lead" from that line. The lead is spawned at start and at replan, never by the implementer.

### 3. Implement

Follow [implement/SKILL.md](../implement/SKILL.md), which **reads** `### Plan` instead of planning, through the pre-review gate. Move to `In Review` only when that gate is true. One implement → In Review role comment. Do not merge. Do not tick description Acceptance criteria.

### 4. Fresh review

Two gates, in this order (ADR-0058). A review matrix exists only after a reviewer has written it, so the matrix is never part of the gate that runs first.

**Pre-review gate** (before any reviewer exists): `node scripts/gate.mjs pre-review <pr> --issue <KIT-n>`. It folds `pnpm check:review-gate`, the PR write-scope check and `wait-for-checks` into one verdict line and logs it; it never reads the matrix. Exit `0` open, `1` closed (fix the named step), `3` waiting (checks pending, run again), `4` unknown (retry once, then ask). Run it from the PR's worktree: when HEAD is not the PR head it exits `4` (`run this gate from the PR's worktree`). Mechanical steps run first and the wait for checks only when they are clean. The scope comes from the PR body, else from the Linear issue's `write-scope:` line; an issue scope the PR body lacks closes the gate with `scope-missing-in-pr` (the Engineer copies the line into the PR body; log `reason --code scope-missing-in-pr`). Before a reviewer is spawned run `node scripts/head-changed.mjs <KIT-n> --pr <pr>` (the head comes from GitHub, never from the cwd): exit `1` means this head was already audited red; change the code first.

**Full review gate** (after the reviewer has written `### Review matrix` in the workpad): `node scripts/gate.mjs review <pr> --issue <KIT-n>`. The pre-review steps again, plus the matrix validation, as one verdict line. The parent takes a verdict only when this gate is open.

The single steps, when you need one alone: `pnpm check:review-gate`. Red → fix it and stay in step 3; a review never sees what a script can say.

Then wait for the required checks yourself when only checks are left: `node scripts/wait-for-checks.mjs <pr> --timeout <s>` (ADR-0050). It is the one sanctioned wait; the ratchet hook denies the watch flag, sleeps and loops. Exit `0` go on, `1` red (fail, below), `2` still pending at the timeout, `3` behind or conflicting (rebase, rerun), `4` retry once, then ask, `5` gh unusable (immediate; the line names the cause: report it, do not retry). In a bb thread a foreground command is capped at 10 minutes: use `--timeout 480` and repeat it while it exits `2`. **Never ask the human whether CI is green, and never stop to wait for a build.**

Spawn one Task (`subagent_type` `generalPurpose` or `bugbot` only if the human asked Bugbot). Prompt: read `.cursor/skills/code-review/SKILL.md` and run it on this issue’s PR / merge-base diff, with the workpad's `### Review matrix` and `lastReviewSha` when there is one. Return every hard finding; do not stop at three. The sub-agent writes the matrix; the parent then runs the full review gate (`gate.mjs review`), which validates it, before taking a verdict.

Parent aggregates:

- Hard Spec or Standards findings, red required checks, or `CONFLICTING` → **fail**.
- Both axes clean, `MERGEABLE`, required checks green → **pass**.

### 5. Fix loop (fail)

**Light fail first.** When every finding is tagged `[text]` or `[name]` and the checks are green: stay `In Review`, fix in place, run `node scripts/classify-fix-diff.mjs <lastReviewSha>`. `light` → read that diff against each finding (a Task that sees only the fix diff and the findings, not a three-axis review), rerun `pnpm check:review-gate`, update the matrix rows the fix touched, `lightFixes` +1, one role comment, then step 6. `reviewLoops` unchanged; the third light fix on one issue counts as one `reviewLoops`. `full` → the tag was wrong: continue below as a normal fail.

Otherwise move to `In Progress`. Write the **full** set under workpad `### Review feedback` (file/criterion + what done looks like). One checker-style role comment with axis headings. Increment the checker-fail side of `### Loop counters`.

**Replan.** When the feedback shows the plan itself was wrong (wrong file split, a missing Role, a path outside the write-scope) or the implementer recorded a plan conflict under `### Notes`, spawn the lead again with mode `replan` and the `### Review feedback`, log `reason --code replan`, and run the implementer on the strong model (`startDecision` with `replan: true`). Otherwise the lead is not spawned again.

Log every verdict: `node scripts/run-log.mjs audit --issue <KIT-n> --verdict green|amber|red --round <n> --sha <head> [--rows <failing matrix rows>]`, and a `reason` per failing cause with a fixed code (`scripts/lib/run-log.mjs` `REASON_CODES`). Report with `node scripts/run-log.mjs report`.

Then resume implement: **fix the class**, not the cited file. Re-run the pre-review gate. Return to step 4.

Stop the issue (leave `In Progress`, role-comment) when checker-fail returns hit five, or CI-fail cycles hit five (`WORKFLOW.md` loop cap). Do not land.

### 6. Pass

`Approval`. Tick description Acceptance criteria `[x]`. One checker-style verdict comment per criterion. Clear addressed `### Review feedback`.

### 7. Land

Take the merge queue lock first: `node scripts/merge-lock.mjs wait <pr>` (background; exit `0` taken). It is a ref on origin, so it holds across machines (ADR-0054). Then `node scripts/sync-pr.mjs sync <pr>` from the PR's worktree: `CURRENT` or `SYNCED` go on (after `SYNCED` wait for the required checks again), `CONFLICT` goes back to the implementer, `CLOSED` stops. Right after `SYNCED` renew the lock (`node scripts/merge-lock.mjs take <pr>`) and renew it again before and during any long wait while holding it, since a lock older than 30 minutes is taken over; `merge-lock.mjs status` shows holder and age, and only a human uses `release <pr> --force` to clear a crashed holder. `sync-pr.mjs` needs HEAD to equal the PR head by SHA (run it from the PR's worktree). A review pass stays valid after `SYNCED`: `node scripts/sync-pr.mjs valid <audited-sha> --pr <pr>` says `AUDIT-VALID` when only clean merges of `<lanes.integration>` were added. Release the lock when land has ended either way: `node scripts/merge-lock.mjs release <pr>`. Never rebase after the PR is open, and never rewrite a pushed branch.

Move to `Merging` (approver-present). Follow [land/SKILL.md](../land/SKILL.md) and [land/references/merge.md](../land/references/merge.md). Success → run `node scripts/gate.mjs land <pr> --issue <KIT-n>`: only exit `0` (PR merged, merge commit on `origin/<lanes.integration>`, checks on that commit green) allows `Done` + role comment with merge SHA; `3` waits and reruns and the issue stays `Post-Merge` until then (move it to `Post-Merge` yourself when you see `MERGED`, if Linear's GitHub automation has not); `1` is a merge fail. Merge fail → `In Progress` + merge error under `### Review feedback` + increment `reviewLoops` + resume from step 3.

### 8. Reap worktree

After land success, follow [reap-worktree/SKILL.md](../reap-worktree/SKILL.md): verify the branch is on `origin/<lanes.integration>`, remove the issue worktree, delete the merged remote branch when safe.

## A step that returns no result line

When a spawned step ends without its result line (`LEAD-RESULT`, `ENGINEER-RESULT`, `AUDIT-RESULT`, the lander's), `node scripts/gate.mjs result <TAG> <file>` exits `1` (`NO-RESULT`). Log `reason --code no-result-line`, then run the gate for that step yourself (`gate.mjs pre-review`, `review` or `land`) and go by its exit code. Never take a silent step for a pass.

## Running inside bb

When `BB_THREAD_ID` is set, each step is a child thread: follow [bb-orchestrate/SKILL.md](../bb-orchestrate/SKILL.md) for machine routing, spawning, and the audit receipt (`node scripts/audit-receipt.mjs post <pr> --thread <reviewer>`, ADR-0056), which replaces the in-session Task sub-agent as the proof that a fresh review ran. `node scripts/verify.mjs --changed` (ADR-0055) runs the suites a change touches and reuses green ones; `INCOMPLETE` is not green.

## Run log

Every issue leaves lines in the central run log (`flow.runLog` in `factory.config.json`, default file `run-log.jsonl` in the gitignored `.factory` folder of the main checkout): `start`, `spawn`, `result` (with provider, model and tokens when `bb thread show --json` exposes them, else null), `audit`, `reason`. Only this orchestrating session writes it. `node scripts/run-log.mjs report` compares issues with and without a lead by review rounds and tokens (ADR-0051, ADR-0052).

## After the batch

List each identifier: landed SHA, worktree reaped (yes/no), still in loop, skipped (reason), or blocked. Do not start unnamed issues.
