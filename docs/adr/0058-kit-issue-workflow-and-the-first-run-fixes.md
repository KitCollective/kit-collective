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

Status: accepted; revisit after the first real `kit-issue` run.
