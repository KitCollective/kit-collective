# The kit-issue workflow, and the four defects the first bb run found

Nicklas, 2026-10-11, after KIT-337 (the first real bb run, PR #305). It exposed six defects in the flow. Four are fixed here; the other two (bb exposes no token usage; Linear's GitHub integration sets `Done` on merge before the land gate) are handled elsewhere. This ADR also records what the native `kit-issue` bb workflow is, and what bb's workflow API cannot do. It builds on ADR-0051 to 0057.

## The four fixes

1. **Two gates, in order.** `gate.mjs review` validated the review matrix, but ran before any reviewer had written one, so it could not be open. There are now `gate.mjs pre-review` (code-english, doc references, PR write-scope, `wait-for-checks`; it never reads the matrix) and `gate.mjs review` (the same plus the matrix), and the full one runs only after the reviewer. `issue-session` step 4 and `bb-orchestrate` say so. The run log's gate names gain `pre-review`.
2. **No turn ends on a background wait.** The Engineer ended its turn on a background `wait-for-checks` and never emitted `ENGINEER-RESULT`; nothing re-invokes an idle thread, so the run stranded for ~15 minutes. `implement` now says: wait in the foreground with `--timeout`, and on a timeout end with a result (`blocked ci-pending: ...`, or `ready` naming the pending checks); the result line is the last line on every path. Runner side: an idle thread without a result line is logged `no-result-line` and re-prompted **once** (`bb thread tell`); a second silent idle is not re-prompted, the orchestrator runs the gate and treats the step as blocked. The `kit-issue` workflow gets this structurally: every step returns through a result schema, and an engineer that ends without one is logged and run once more.
3. **Linear escapes `*`.** A saved description holds `scripts/tests/\*\*`. `parseWriteScopeGlobs` now removes a backslash before markdown punctuation, so the scope check no longer fails on text that reads correctly.
4. **The PR carried no `write-scope:`.** The Engineer copies the issue's `write-scope:` line into the PR body (`implement`). The gate reads the scope from the PR text, else from the Linear issue (so the scope step still runs), and when only the issue declares one it closes with `scope-missing-in-pr` (a new run-log reason code, distinct from `scope-miss`). CI's own scope step reads only the PR text and is unchanged; the gate is where the gap is caught.

## The kit-issue workflow (`.bb/workflows/kit-issue.js`)

`bb workflows run --file .bb/workflows/kit-issue.js --args '{"issue":"KIT-123"}'` from a bb project thread. The flow is `session-check` → `run-log start` → `start-decision` → claim → Lead (if the decision says plan; `claude-opus-5-5`, read-only by prompt) → Engineer (model from the decision) → `gate.mjs pre-review` → `head-changed` → `In Review` → Reviewer (fresh hidden thread, never the Engineer's model: Fable for an Opus engineer, Opus otherwise) → `gate.mjs review` → `audit-receipt.mjs post --dry-run --require-different-model` → `Approval`. A red review or closed gate runs a bounded fix loop (default 2 rounds, `maxRounds` up to 3); `blocked`, `plan-approval` and `blocked-by` results are routed as `issue-session` says; amber (checks pending) holds `In Review`.

**It stops at Approval, and that is enforced in the script, not asked for.** The only Linear states it can write are `In Progress`, `In Review`, `Approval` and `Blocked` (`MAY_SET`; any other throws). It runs no merge lock, no sync, no `/land`, no reap, and the receipt only as `--dry-run`. `Approval` is not merge permission; a human moves the issue to `Merging` and starts `/issue-session`/`/land` (ADR-0057).

**What bb's workflow API does not offer** (read from the bundled plugin and its docs; nothing was faked around it):

- **No shell in the script.** Repo scripts are run by a runner worker (`claude-haiku-5-5`, low effort) told to run fixed numbered commands and report each exit code and last line. Commands are built from validated tokens only (issue key, PR number, thread id, model ids), never from agent text. This is the weak point: a runner is a model, not a function call. Every runner step costs a small thread.
- **No per-agent machine, worktree or visibility.** `agent()` accepts only provider, model, reasoningLevel, schema, label and phase. Every worker is a hidden thread that **reuses the origin thread's environment**. So the whole run is on the starting thread's machine and routing a slice to another machine is not possible with this workflow (see below). The Engineer works in the origin checkout rather than a fresh managed worktree, and the Reviewer reads that same checkout (HEAD equals the PR head, which `gate.mjs` wants). `machine` in the args is only written to the run log.
- **No thread id from `agent()`.** The run log and the receipt need thread ids, so each worker reports its own `$BB_THREAD_ID` in its result. That is self-reported, one more step of provenance and not proof (ADR-0056).
- **Run log writer.** The workflow's runner workers are the orchestrator of ADR-0052 and the only writers; the Lead, Engineer and Reviewer never write it. `spawn` is logged after the step ends (the thread id is only known then), not before it starts.
- **Audit round.** A dry-run receipt does not log an `audit`. The workflow logs `audit` only for red verdicts (the fix-loop evidence `head-changed` reads); a green audit is logged when a human posts the real receipt, so it is not counted twice.

`.bb/workflows/kit-slice.js` (Cursor/Pi era) is superseded by `kit-issue`. The ratchet hook blocks deleting it from an agent session, so a human removes it.

## Limits that change how far to trust it

- **One environment for every worker.** bb has no per-agent machine or worktree option, so the Lead, Engineer, Reviewer and runners all run in the environment of the thread that started the run. The Reviewer is **not** a fresh worktree, and a slice that needs the Mac (device flow, simulator, EAS, DB tests) cannot be split from the container-side steps: the whole run happens on one machine. The machine routing table of `bb-orchestrate` applies to hand-driven runs only. Starting the run from a Mac thread runs everything there.
- **Gate results are relayed by a model.** Every exit code and verdict line reaches the script through a runner model that is told to relay it. They are exactly as reliable as that model. **Until Decision 2 below is settled, the gate results of this workflow must not be treated as merge-grade**: a human re-runs `gate.mjs review` and the receipt (the `Merging` step already does) before any merge.
- **Agent text never enters a command.** Rows, outcomes, verdicts, SHAs, thread ids and PR numbers are checked against fixed patterns or sets before they are put in a runner command; a value that fails is dropped, or the step counts as having no usable result. Free sentences are only used as notes and prompts.
- **A refused receipt dry run is not a green.** The receipt's exit code must be 0 (same-model, no logged spawn or no `AUDIT-RESULT` line all refuse); otherwise the run holds `In Review`, logs `evidence-gap`, and does not move to `Approval`.
- **Status equals Linear.** Every return reports the state Linear actually shows. A run that is out of rounds goes to `Approval` with `ready-for-human` (a person has to act), not back to a state it never moved to.
- **File format unverified.** `bb --help` on the machine of the author lists no `workflows` command in the top-level list, although `bb workflows --help` answers (the plugin command is installed and running). `bb workflows validate` needs a project thread and was never run, so the file format (literal `meta`, top-level `return`, option names) follows the bundled plugin docs and is validated here only by a fake runner.

## Verified, and not

Verified by tests: the gate ordering and the scope source, the unescape, the `start-decision --issue` flag, and the workflow's control flow against a scripted fake of `agent()` (stop at Approval, never a forbidden state or command, reviewer model differs, spawns logged with thread/provider/model, retries, fix loop, blocked routing). **Not verified: any run against real bb threads, `bb workflows validate` (it needs a project thread; the source is syntax-checked by the test harness only), whether a schema'd worker's thread output still ends with the `AUDIT-RESULT` line the receipt reads, and `BB_THREAD_ID` being visible to workers.**

## Decision needed

1. **Does a schema'd Reviewer's thread output still end with `AUDIT-RESULT`?** The receipt reads the last line of `bb thread output`; a worker told to call the result tool may end with no text. If the dry run says `no AUDIT-RESULT line`, the Reviewer prompt needs to end with the line after the tool call, or the receipt must accept the schema'd verdict. Decide after the first real run.
2. **Runner workers or a plugin?** A runner model running scripts is the compromise. A small bb plugin command that runs the gate scripts deterministically would remove it. Worth a spike if runner mistakes show up.
3. **Reviewer model pairing** (Fable for an Opus Engineer, Opus otherwise) and **amber handling** (hold `In Review`, do nothing) are my defaults.
4. **Fix-loop depth.** 2 rounds by default, 3 maximum, against the five of `WORKFLOW.md`. Raise it only when real runs show 2 is too tight.
5. **Delete `kit-slice.js`** (human, hook-protected).

## What the first real run taught (KIT-285, PR #310, run wfr_25e1a2eb; 2026-10-12)

The run stopped at the pre-review gate with "no output from gate.mjs pre-review" while the real cause was elsewhere. Three links failed in a row:

1. **gh was too old.** The bb-harness container had gh 2.23.0, whose `gh pr checks` has no `--json`. **The first version with `--json` was not established**: a web search did not return it, and `2.40` (an earlier guess) is not a verified number. The requirement is therefore written as a capability, not a version: `gh pr checks --help` must list `--json`. Known good: **2.102.0** (the container now). Known bad: 2.23.0. `wait-for-checks.mjs` probes this at startup.
2. **`wait-for-checks` retried a permanent error.** Every `gh` failure was folded into exit 4 and retried until `--timeout 1500`. Now a usage, auth, not-found or invalid-JSON failure, or a gh without `--json`, is exit **5** at once, with a verdict line naming the cause (`UNKNOWN: gh too old, needs ...`, `UNKNOWN: gh failed, retrying cannot help: <first stderr line>`). Pending checks, network errors, 5xx and rate limits still retry. `gate.mjs` reports `5` as UNKNOWN (4) with that line.
3. **The runner backgrounded the command.** The Haiku runner put the 1500 s gate in the background and ended its turn with prose, so `results` was empty, and the script read that as a gate result. Now `sh()` is the one place that detects a missing result (an empty array, or fewer results than commands without a failing last one). It retries once for idempotent commands (session-check, both gates, head-changed, the receipt dry run), logs the new reason code **`runner-no-result`**, and returns a synthetic `{ code: 4, runner: true }` whose line names the command that was meant. A runner failure never opens a fix round, is never logged as `gate-closed`, and the stop note starts `runner-no-result:`. The runner prompt forbids `&`, `nohup`, `timeout` and `sleep` wrappers and a prose ending, and says to wait in the foreground.

4. **The 10 minute foreground cap (the likely root cause of 3).** A claude-code thread's foreground command is capped at 600 s, and the gates ran with `--timeout 1500`, so a runner could not hold the wait and backgrounded it. Every wait now runs in **slices of `--timeout 480`** (`GATE_SLICE_SECONDS`), and the workflow repeats a slice while the verdict is waiting (gate exit 3), at most `GATE_SLICES = 5` times: about 40 minutes of wall clock, the bound being a constant. Nothing is logged per slice, only the final result. When every slice still says waiting, the run stops with `ci-pending` logged and the note `still waiting after 5 slices of 480s`: `In Progress` before the Reviewer, `In Review` after it, never a fix round. A runner retry (empty result) is a separate runner thread with its own 600 s cap, so a retry cannot push one call past the cap; it can only add a slice's time to the bound. The Engineer waits the same way (`wait-for-checks --timeout 480`, repeated in the same turn up to 5 times, then `blocked ci-pending`). An earlier text of this ADR and `implement` said 1500 s in one call: that is superseded.

**`--timeout` of `gate.mjs` is the total budget of one call.** The mechanical steps (`check:review-gate`, code-english, doc references, matrix, scope) run before the wait, so the wait gets `--timeout` minus the elapsed time; with less than 30 s left it is skipped and the gate answers waiting (exit 3) at once. The slice is 480 s, not 540 s: the budget is a bound on gate.mjs's own work, not a proof about the runner's overhead or a hung mechanical step, so there is margin under the 600 s cap instead of a claim of exactness. A waiting verdict is not written to the run log (`gate ... closed` would otherwise be logged once per slice); only the final open or closed verdict is.

A fresh PR can answer not-found for a moment, so `wait-for-checks` retries a not-found answer 3 times (one per `--interval`) before it counts as permanent (exit 5).

**Gate results through a runner model are still not merge-grade.** Detecting an empty result does not make a relayed exit code trustworthy: a runner can still report a wrong code or a wrong last line. A human re-runs `gate.mjs review` and the receipt before any merge, as the `Merging` step already does. Decision 2 (a deterministic plugin command) stays open and is more attractive after this run.

### Resume (`"resume": true`), as read from the workflow and its tests

Before this change, resume did this: `session-check --resume` skipped the PR, branch, state and run-log checks; the claim to `In Progress` was skipped in the start step and made at the top of every Engineer round instead; the Engineer prompt said "the branch and the PR exist" but **named no PR**, so the Engineer had to find it, and nothing stopped it from opening a second one; a second PR would have gone through the gates as the new `prNumber`. A closed pre-review gate or a head already audited red is not remembered by the workflow: both gates run again from the PR's current head, and `head-changed` still refuses a head the run log shows as audited red.

**Resume skips the Lead when a plan exists:** before the Lead, a read-only step (`node scripts/workpad-has-plan.mjs <KIT-n>`: exit 0 `### Plan` heading in the workpad, 1 none, 4 unreadable) decides; a plan skips the Lead and logs reason `lead-skipped`, no plan runs it, an unreadable workpad stops the run (it must not risk overwriting the plan). `skipLead: true` still skips it.

Now: a read-only runner step (`gh pr list --state open --search "<KIT-n> in:title"`, filtered to titles that start `<KIT-n>:`) returns the open PR numbers. Exactly one number (digits only) is validated and handed to the Engineer; none means the prompt says to open exactly one PR; two or more, or an unreadable answer, stops with `stoppedAt: resume` before any Engineer is spawned. If the Engineer then reports a different PR number than the known one (resume or a later fix round), the run stops before any gate reads it.

**Gaps that remain:** (a) the lookup finds open PRs only: a merged or closed PR from an earlier run is invisible, and a resume then opens a new one; (b) the title match assumes the `<KIT-n>:` title convention; (c) a branch without a PR is reused only by the Engineer's own judgment; (d) the Engineer's claim that it opened no second PR is checked only through the PR number it reports, not by listing PRs again after the step.

### Verified, and not, after this change

Verified by tests: the exit-5 paths with a fake `gh` on PATH (too old, usage error mid-run, auth, invalid JSON; transient network and rate limit still retry), `foldReview` on exit 5, runner empty/short detection with one retry, `runner-no-result` logging, no fix round on a runner failure, the runner prompt text, and resume's lookup, number hand-over, second-PR stop and ambiguity stop. **Not verified:** a real bb run, whether a real Haiku runner obeys the foreground rule, and `bb workflows validate` (re-run it in a bb thread after merging; the `agent()` calls keep literal `provider` and `model` values and plain options).

## What the second real run taught (KIT-295, PR #316; 2026-10-13)

**The runner made up exit codes.** Four of seven runs stopped on a command that had passed: `session-check` twice, `head-changed` and the pre-review gate each printed `OPEN` and exited 0, and the Haiku runner reported `-1`, saying itself that its shell tool had not shown an exit code. The script read `-1` as a closed gate or a failed step.

Now the shell prints the code. `runRaw` wraps every command as `( <command> ); echo "KIT-EXIT:$?"`, the runner relays that line verbatim in `exit` (the schema has no `code` any more) and the last line before it in `line`, and the script parses the code from the marker. A result whose `exit` is not exactly `KIT-EXIT:<digits>` is no result: it takes the `runner-no-result` path of fix 3 (one retry for idempotent commands, then a stop that is never a gate verdict). This supersedes "report each exit code" in the workflow section above.

**What this does not change.** The marker is still relayed by a model, so a runner can still copy it wrongly; gate results stay not merge-grade and Decision 2 (a deterministic plugin command) stays open. Verified by tests with the fake runner only (the wrapping of every command, a made-up code counting as a runner failure); the first real run with the marker was the resume of KIT-295 that followed this change (`wfr_c3fc1e09`). Its orchestrating thread reported that all 19 runner steps relayed the marker and none was misread; on three steps the runner also put the marker in `line`, which is only used as a note.

## What the night of 2026-10-12 cost, and the two guards (2026-10-13)

KIT-283, KIT-286 and KIT-295 were started 17 times in about 14 hours and the account hit its spend limit three times. The made-up exit codes above caused the stops; two other things made each stop expensive, and they are changed here.

**A resume built again before it reviewed.** Every resume ran a full Engineer round on the existing PR before the Reviewer, also when the PR was built, CI was green and only the review was missing (KIT-295: five Engineer rounds, four changed nothing). Now a resume with an open PR first runs `node scripts/resume-point.mjs <KIT-n> --pr <n>`. It answers "review it as it is" only when the last Engineer result in the run log is `ready` and no findings are open against the head (the head-changed rule). If the pre-review gate is then open, the run starts at round 0: the Reviewer alone, logged as `reason engineer-skipped`, with no move to `In Progress`. Round 0 is not an Engineer round, so `maxRounds` still counts Engineer rounds and a red round-0 review still gets its fix round. Every other answer (an Engineer that ended `blocked` or `failed`, no Engineer result, open findings, a closed gate, an unreadable source) builds first, as before; a closed gate's line becomes the change request.

**Nothing counted runs.** `maxRounds` bounds one run; nothing bounded how many runs an issue got. `session-check.mjs` now refuses when the run log holds `flow.maxRunsPerDay` (factory.config.json, default 3) `start` events for the issue inside 24 hours, on resume too. Only runs that passed the session check count, because `start` is logged after it. The cap is a committed number and not a flag or a workflow argument: the thread that retries is the thing being capped, so it must not be able to raise it. A person who wants a fourth run changes the number in a PR or waits.

**What this does not change.** Each script step is still one runner worker (Decision 2 stays open), and a resume that does build still starts a new Engineer thread without the previous one's context. The resume point trusts the run log's last Engineer result, which is as reliable as the run that wrote it; the pre-review gate and the Reviewer still judge the head itself. Verified by tests with the fake runner and by unit tests of `resumePoint` and the cap in `sessionCheck`; not yet by a real run.

## Fewer runners per run (2026-10-13)

Every runner is a whole agent session that starts with the repo's full context to run one or two commands. A green run spent ten; it now spends eight, a fix round spends three fewer, and a resume that reviews the head as it is spends ten where it would have spent thirteen. No command was removed: steps whose result nothing reads now share the runner of the next step.

- The Engineer's two run-log lines ride with the pre-review gate, the Reviewer's two with the review gate (`shAfter`, `gateSlices(..., before)`). They are still written before the gate runs, so the gate and the receipt read a run log that has them.
- A stop before the gate (an Engineer that ended `blocked` or `failed`, a second PR, an amber review) writes those lines with a runner of their own, as before.
- The move back to `In Progress` before a fix round rides with the round's closing log (`log:red`), and is left out after a closed pre-review gate, where the issue never left `In Progress`.
- On resume, `lead-skipped` rides with the resume point and `engineer-skipped` with the move to `In Review`.

**What stays apart, on purpose.** A command whose exit code decides what happens next keeps its own runner: `head-changed` is not joined with the move to `In Review`, nor the receipt dry run with the move to `Approval`. Joined, the script would rely on the runner model to stop after a failing first command, and a runner that did not would leave Linear saying `In Review` or `Approval` for a run that stopped. A shared runner that comes back incomplete does not repeat the log lines; the gated command is asked once more alone, two attempts in all, as before.

Verified by tests with the fake runner (the runner labels of a green run and of a resume, the order of log lines and gates, the stops that write their own log, the fix round's states); not yet by a real run.

## A resume in an old worktree ran the old harness (KIT-283; 2026-10-13)

The first run after the three changes above was a resume of KIT-283, started in the issue's existing worktree to keep its uncommitted work. That branch had been cut before the fixes, so the run read the old workflow file from it and stopped on a made-up exit code again; the session check it ran had no run cap. A worker runs the copy of `scripts/` and `.bb/workflows/` in the worktree of the thread that started the run, and nothing compared that copy with the integration lane.

Two rules now:

- **Start the run from the main clone's file.** `bb workflows run --file <main clone>/.bb/workflows/kit-issue.js`, not a path relative to an issue worktree. The workflow file is read when the run starts, so no step inside it can replace a stale copy of itself.
- **The first step compares the harness with the lane.** In the session check's own runner, before the check: `git fetch --quiet origin development`, then `git diff --quiet origin/development -- .bb/workflows scripts factory.config.json`. A difference stops the run at `harness` with the instruction to merge the lane into the branch (or start from a fresh worktree). It is plain git and not a repo script, because a stale worktree may not have the script. It runs before `start` is logged, so the stop costs no run of the cap. A comparison that could not run is a stop too.

**What this does not cover.** An issue that itself changes `scripts/`, `.bb/workflows/` or `factory.config.json` always differs from the lane and cannot run through `kit-issue`; harness work stays hand-driven, as it has been. The comparison is relayed by a runner like every other command.

## Correction: the main clone's path is refused (2026-10-14)

The first rule above, start the run from the main clone's file, cannot be followed. bb refuses a workflow file outside the starting thread's workspace ("Workflow scriptPath must stay inside the origin workspace"), as the KIT-283 resume of 2026-10-14 found. So a run uses the thread's own worktree copy, and the copy must be current when the run starts: a thread in a fresh worktree from `origin/development` has it; a thread in an existing issue worktree merges `origin/development` into the branch and pushes first. The harness comparison stays and catches a copy that is stale anyway, for every branch that already holds it. The 2026-10-13 KIT-283 thread that was scheduled with the main clone's path never ran.

## The shell tool backgrounds a long command (KIT-286; 2026-10-14)

Since the pre-review gate waits for the hosted Device flows run (ADR-0059), a gate slice can wait its full 480 s. The KIT-286 resume of 2026-10-14 lost both attempts of its pre-review gate that way: Claude Code's shell tool moves a command to the background after 2 minutes unless the caller sets a longer timeout, so the Haiku runner was left with a background task and ended its turn on prose ("runner-no-result"). The 10 minute foreground cap above is the tool's maximum, not its default. The runner prompt, and the Engineer's CI wait, now tell the worker to set the tool's timeout to 600000 ms on every command. Earlier runs never met it because their gates finished in under 2 minutes.

## The Reviewer's result line (KIT-283, KIT-286; 2026-10-14)

Two green reviews stopped at the receipt dry run: the receipt reads only the Reviewer thread's last text message, and both Reviewers wrote the verdict, then saved the matrix to the workpad and returned through the result tool, so their last text was "Writing it to the workpad now". Each time the orchestrator asked the Reviewer once for the line, as bb-orchestrate allows, and the receipt passed.

The workflow now does that itself: when the dry run is refused for exactly that reason, it unarchives the Reviewer thread (bb archives a worker when it returns), asks it once with `bb thread tell` for `AUDIT-RESULT <issue> green <sha>`, waits, and runs the dry run again. The message is built from checked tokens only. Any other refusal is not retried, and a failed ask leaves the stop as it was. The Reviewer prompt also says to write the line as its last text, after every other tool call. The receipt's rule (the last line only, ADR-0056) is unchanged.

Status: accepted; revisit after the next real `kit-issue` run.

Renamed (KIT-350): the workflow this ADR calls `kit-issue` is now the AFK developer (the term in `CONTEXT.md`), `.bb/workflows/afk-developer.js` (`meta.name` `afk-developer`). Behaviour is unchanged; the body above keeps the old name as history.
