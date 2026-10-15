---
name: implement
description: Implement a delegated Linear issue. TDD at spec seams, spawn domain helpers, open a PR into the integration lane. Use for delegated To-do issues and for resuming In Progress.
disable-model-invocation: true
---

# Implement

Load `factory.config.json` then `WORKFLOW.md`. Resolve names from [../_shared/factory.md](../_shared/factory.md). If `linear.setup.json` is missing, stop and run `/bootstrap-linear`.

Implement the work on Linear issue `{{ issue.identifier }}` (spec + tickets + comments).

Use `/tdd` where possible, at the seams already listed in the spec’s Testing Decisions (`/codebase-design` vocabulary). Do not quiz for seams during an unattended run. A hard repro with no loop yet → `/diagnosing-bugs` first, then TDD at the seam.

Run typechecking regularly and single test files during the loop. Before `In Review`, run the **full** test graph (`pnpm test` or the repo’s equivalent) — a targeted filter is not a substitute. Wait for **all** required GitHub checks on the PR (including image/deploy smokes), not only `test`.

Do **not** run `/code-review` as the pass verdict. Checker owns that in a fresh VM. You run the mechanical **pre-review gate** below instead.

Do not treat “commit to the current branch” as done. The factory exit is a PR into the integration lane, proof on Linear, and status `In Review`.

## Unattended run

1. Status must be `In Progress`. If it is `dispatch.state`, stop — planner claims, you do not. Resume when a branch/PR already exists (checker or land sent work back). Same branch.
2. Every run: Linear `get_issue` **and** `list_comments` on this issue. `get_issue` does not return comments. Find the workpad (`agent.workpadHeading`). If a GitHub PR is attached, also read PR review comments.
3. On resume, treat `### Review feedback` and other issue/PR comments as the change request. Do not start a new branch. **Fix the class, not the instance** — if feedback names `ci.yml` missing `JWT_SECRET`, grep every workflow that boots the API; if it names one design-system miss, re-read the lock against the whole UI diff.
3a. **Read `### Plan`.** When the workpad has a `### Plan` (written by the lead, `.cursor/agents/lead.md`), follow it: its steps, its file split and its briefs, one brief per Role you spawn. A plan whose result was `plan-approval` needs the approval before you start. When reality contradicts the plan (a file it assumes is not there, a path outside the write-scope), stop and record it under `### Notes`; the orchestrator spawns the lead again for a replan. When there is no `### Plan` (a small issue the start decision sent straight to you, or a run without `/issue-session`), plan inline as before: steps, seams, Roles.
4. One workpad comment. Start: branch from `origin/<lanes.integration>`. One issue, one PR **into that lane**. Title `<teamKey>-n: …`. Copy the issue's `write-scope:` line verbatim into the PR body (own line, `write-scope: a/**, b/**`, with no backslashes: Linear shows `\*\*` for `**`, write the plain glob). CI's scope ratchet and the review gate read the PR text; a PR without the line is closed by the gate as `scope-missing-in-pr` when the issue declares one.
5. Out of scope → `/signal-up` (cap `agent.signalUpCapPerRun`). Ratchet files required by `### Review feedback` are in-scope (`docs/agents/write-scope.md`).
6. Evidence. A slice whose surface has device-flow evidence: write the slice's own Device flow (`apps/mobile/.maestro/slices/<KEY>.yaml`, from `slices/TEMPLATE.yaml.example`) and, after the PR is open, ask for the hosted run with `node scripts/request-device-flows.mjs <pr> --issue <KEY>` (ADR-0059). It runs on a GitHub macOS runner and sets the `Device flows` status on the PR head; the pre-review gate waits for that status with the checks, so wait with the gate in slices as for CI. A new commit is a new head: ask again. Do not run `device-run.sh` yourself: it needs the approver's Mac, a full Xcode build and about 12 GB of free disk, and it is the approver's own tool for the before/after comparison (`docs/agents/device-flows.md`). A red flow is yours to fix: the status links the run, whose artifact holds the screenshots and the recording. Any other slice: upload screenshots/recordings to this Linear issue, then comment and link under `### Evidence`.
7. After the PR is attached **and the pre-review gate passes**: clear addressed review feedback, move to `In Review`. Do not merge, do not enable auto-merge, do not post a `kc/audit` status, do not move to `Merging`, `Post-Merge` or `Done`: only a person or `scripts/auto-land.mjs` (ADR-0061, off by default, run by the orchestrator after review) sets `Merging`, and the engineer's normal path ends at `In Review`.
8. If `### Review feedback` required a ratchet, land it in this PR (`docs/agents/error-ratcheting.md`). Tighten only.

When this run is a bb thread (`bb-orchestrate`), end the final output with `ENGINEER-RESULT <KIT-n> ready|blocked|failed <one sentence>` as the very last line, on every path, including a CI timeout or a wait you could not finish (never end a turn without it); `ready` only after the pre-review gate below is true. A `blocked` sentence starts `needs-human: <what you ask>` when a person must answer or decide (the orchestrator moves the issue to `Approval` and fills `### Waiting`; you write what is asked and the stage you stopped at under workpad `### Waiting`), or `blocked-by KIT-m: <why>` when another issue must be done first (the orchestrator relates it with `linear.mjs block` and moves it to `Blocked`). Never move the issue to `Approval` or `Blocked` yourself. On resume, `### Waiting` says what was asked, where you stopped and `Resumed: <date>`; the human's answer is in a Linear comment.

## Pre-review gate (do not skip)

Do not move to `In Review` until all of these are true. Record the commands under workpad `### Validation`.

1. **Locks** — if the slice has UI, read `docs/design-system.md` (tokens, type roles, tab-bar anatomy, component inventory). If it has Nest `/v1` or auth, read `{paths.specs}/Architecture/tech-stack.md` (module boundaries + auth). Flag gaps; do not invent.
2. **Roles** — spawn every matching Role (`/tdd`): Frontend, Backend, DevOps. A slice that touches Nest HTTP and Expo screens whose workpad says `(none)` is a process miss. If the issue cites `docs/design-system.md` or named lock components (Search, Sheet, Mark, Banner, Tab bar, Empty state), **Frontend** must run — Backend+DevOps alone is not enough.
3. **Lane** — `git fetch origin <lanes.integration>` and rebase or merge so `gh pr view --json mergeable` is `MERGEABLE`. Behind the lane is not shippable.
4. **Tests** — full graph, not only the files you touched. Typecheck every package whose src **or tests** you edited (`pnpm --filter <pkg> typecheck`), not only the client.
5. **CI** — wait until **every** required GitHub check is green or skipped-by-design, with `node scripts/wait-for-checks.mjs <pr> --timeout 480` (one blocking command, exit 0 green and MERGEABLE, 1 red, 2 still pending at the timeout, 3 not mergeable, 4 unknown, 5 gh unusable). **Wait in the foreground, in this turn, in slices:** a foreground command in a bb thread is capped at 10 minutes (600 s), so one long `--timeout` cannot be held and a model that cannot hold it backgrounds it. On exit 2 run the same command again in the same turn, up to 5 times in all (about 40 minutes). **Exit 5 is immediate and its verdict line names the real cause (gh too old, auth, missing PR): end with `ENGINEER-RESULT <KIT-n> blocked needs-human: <that line>`; do not retry.** In a bb thread never start it in the background and end the turn: nothing re-invokes a thread that has gone idle, so the orchestrator would see no `ENGINEER-RESULT` and the run strands (KIT-337 lost ~15 min that way). After the fifth exit 2, or on exit 3, do not wait again silently: end with `ENGINEER-RESULT <KIT-n> blocked ci-pending: <what is still pending>` (or `ready` with the pending checks named in the sentence, when the pre-review gate is otherwise true and the orchestrator's `gate.mjs pre-review` will wait for them). Never the watch flag, a sleep or a loop (the ratchet hook denies them), and never ask the human whether CI is green. Image/deploy smokes count. Pending **or red** → stay on the branch; do not flip status.
6. **Env class** — if you added a required process env (fail-fast at boot), grep `.github/workflows/**` for every job that `docker run`s or otherwise boots that process, and set the var there too.
7. **Mechanical checks** — `pnpm check:review-gate` is clean: no Danish identifier or file name added (`scripts/check-code-english.mjs`), and no living doc names a symbol, prop, flow step or path the diff removed or renamed (`scripts/check-doc-references.mjs`). After a rename or removal, grep `docs/`, `CONTEXT.md` and flow comments yourself too: the script only knows what is distinctive.
8. **AC evidence** — every acceptance criterion (and every What to build clause) has a Validation command or Evidence screenshot. Ticking the workpad box is not evidence. Spec source is the whole issue body, not AC alone.

## Domain helpers

`/tdd` lists `paths.helpers` and spawns **Role** matches from each file’s YAML `description`. v1 roles: Frontend, Backend, DevOps. Skip planner, lead, checker, release, and files whose description says they are a deprecated alias. Do not hardcode stack names (Expo, Nest, design-system) as agent ids.

When a Role matches, it loads **Area skills** on demand: Expo, Nest, design-system — not as spawned agents. Record Role names and any Area skills under workpad `### Domain helpers used`. Product docs win if they conflict with a vendor Expo default.

This implementer still owns the workpad, the branch, `/signal-up`, the PR, and the move to `In Review`. Planner owns claim. Role subagents must not do those.
