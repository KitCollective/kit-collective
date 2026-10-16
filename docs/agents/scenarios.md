# Scenarios: the Holdout repo, the file format and the CLI

Where the Holdout lives, how a milestone's Scenarios are written, and the one command that reads and writes them. Terms (Scenario, Holdout, Scenario judge, AFK developer, Milestone scenarios) are in `CONTEXT.md`; the decisions are ADR-0060.

## The Holdout repo

- A private GitHub repo, named by `scenarios.holdoutRepo` in `factory.config.json` (`KitCollective/kit-scenarios`). `factory.config.example.json` has the same block.
- One Markdown file per milestone: `<project-slug>/<milestone-slug>.md`. A slug is the Linear name lowercased with each run of characters other than letters and digits turned into one `-` (`Holdout Scenarios` is `holdout-scenarios`).
- The milestone `Fixture` of the project `Holdout Scenarios` is a fixture file for tests and demos: `node scripts/scenarios.mjs titles --project "Holdout Scenarios" --milestone Fixture`. It holds no real Scenarios. The setup for a fresh Holdout repo is `docs/agents/scenarios-repo-wizard.sh`.
- Reading it takes the Holdout token (below): `SCENARIOS_GH_TOKEN` on bb-harness, your own `gh` login on the Mac. Prove a machine's read with the fixture command above: it exits 0 and ends with `SCENARIOS titles ...: 2 Scenarios`, and exit 4 names the cause.
- The Holdout repo also holds the producer workflow (its `scenario-flow.yml` under `.github/workflows` there, not in this repo), which turns a flow into a run artifact there (KIT-366). Its source is `docs/agents/holdout-scenario-flow.yml` in this repo; `scripts/holdout-flows-wizard.sh` (stage 1) pushes it to the Holdout's `main`.

### The Holdout token (KIT-366)

Two tokens reach the Holdout, both fine-grained and both selecting the Holdout repo only. Neither is `GH_TOKEN`, which on bb-harness selects `kit-collective` only (from stage 4 of the wizard below on; before it, a classic token that reads every repo of the org), so the AFK developer's `gh` cannot read the Holdout's files or its run artifacts at all.

| Name | Where | Permissions on the Holdout | Who reads it |
| --- | --- | --- | --- |
| `SCENARIOS_GH_TOKEN` | bb-harness: the main checkout's `.env` (`bb.env`) | Contents read/write, Actions read/write | `scripts/scenarios.mjs` only, for every Holdout call (`titles`, `read`, `put`, `check`, `report`, `flow`). It sets `GH_TOKEN` to it for those calls and never for a `kit-collective` call. Unset (the Mac), the `gh` login is used, and a failed Holdout call says so |
| `SCENARIO_FLOWS_TOKEN` | `kit-collective` Actions secret | Actions read | `.github/workflows/device-flows.yml`'s download step only |

`node scripts/scenarios.mjs access` proves the split on a machine. It reads the Holdout's artifact list twice, with the `gh` login (as every thread on the machine reads GitHub) and with `SCENARIOS_GH_TOKEN`, and prints one JSON line `{"verdict":"SCENARIOS access: ambient <denied|reads>, cli <reads|denied|unset>","ambient":...,"cli":...}`. Exit 0 only for `ambient denied, cli reads`; exit 1 for anything else (the verdict names the cause: the `gh` login still reads, or the variable is unset, or the token cannot read); exit 4 when `gh` fails for another reason. It prints no artifact name. On the Mac it is exit 1 by design: your own login reads everything. Setting the tokens up, and replacing bb-harness's `GH_TOKEN`, is `bash scripts/holdout-flows-wizard.sh` (stages 1 and 2 on the Mac, `--from 3` on bb-harness).
- The `scenarios` block also holds `runsPerScenario` (3) and `satisfiedToMeet` (2): the Scenario judge runs each Scenario three times and a Scenario is met when two runs satisfy it.

## The Scenario file format

```markdown
## A Collector adds a shirt from a photo

### Starting situation

A Test Collector with an empty Collection and one photo of a home shirt on the device.

### Actions

The Collector opens the app, taps Add, picks the photo, confirms the suggested labels and saves.

### End state

The Collection shows one Kit with the photo as its cover and the confirmed labels.
```

- One `## <title>` per Scenario. The title is one line and safe to show an Engineer: it names the story and gives nothing away. Titles are unique in a file (compared without regard to case).
- Three `###` sections, each required, each non-empty, each once, with these exact names: `Starting situation` (which Test Collector, which data), `Actions` (what the Collector does), `End state` (what the Collector has and sees afterwards).
- Write in `CONTEXT.md` words and in what a Collector sees. No selectors, no test ids, no file paths.
- Text before the first `##` heading (a `#` heading, a note for the human) is ignored.
- Malformed means: no `##` Scenario in an existing file, an empty or duplicate title, a missing, empty, repeated or unknown `###` section.

## The CLI

`scripts/scenarios.mjs` is the only way into and out of the Holdout. A PreToolUse hook denies the other routes, and every `read` is logged (see "The guard and the read log").

```bash
node scripts/scenarios.mjs titles --project "Holdout Scenarios" --milestone "Holdout"
node scripts/scenarios.mjs titles --issue KIT-288
node scripts/scenarios.mjs read   --project "Holdout Scenarios" --milestone "Holdout"
node scripts/scenarios.mjs put    --project "<project>" --milestone "<milestone>" --file <draft>
```

- `titles` prints one title per line. `read` prints each Scenario in full. Both end with one verdict line, the last line on stdout.
- `titles --issue <KEY>` is the form the AFK developer uses (`titles` only; `read` and `put` refuse `--issue`, and it cannot be combined with `--project`, `--milestone` or `--file`). The CLI reads the issue's Linear project and milestone itself (`scripts/linear.mjs issue`) and prints exactly one line of JSON, which is the last and only line on stdout, because a command runner relays only the last line: `{"verdict":"SCENARIOS titles <path>: <n> Scenarios","path":"<path>","titles":["..."]}`. An issue with no project or milestone gives `path: null` and `titles: []`; a milestone with no Holdout file gives `titles: []` and a verdict ending `no Scenarios (no Holdout file)`. Both are exit 0. A malformed file and an unreadable Linear or Holdout are the same one-line `MALFORMED:` / `UNKNOWN:` verdicts as below (not JSON), and no Scenario text is ever printed. Use `--dir` as with the other forms.
- The AFK developer (`.bb/workflows/afk-developer.js`) runs `titles --issue <KEY>` as the last command of its start runner and puts the titles in the Engineer prompt of every round as what the milestone will be judged on (ADR-0058: the issue key is checked against a fixed pattern before it enters the command, and the answer's path and titles are checked against fixed patterns, at most 20 titles of 1 to 120 printable characters each with no backtick, before they enter the prompt; nothing from the answer enters a command). With no titles the prompt says "no Scenarios"; an answer that fails a pattern, or a failing command, gives "no Scenarios (the scenarios CLI gave no usable answer)". The run continues in all cases: the titles are guidance, not a gate. The Scenario text never enters a prompt; only the Scenario judge runs `read`.
- `titles` is free: it writes nothing. `read` writes one run-log line first.
- `put` is how Scenarios get in; `/to-spec` runs it after the human approves a milestone's Scenarios. It reads the draft from `--file` (required for `put`, refused for `titles` and `read`), checks it with the same parser as `read`, and creates `<project-slug>/<milestone-slug>.md`. It only creates: if the milestone already has a Holdout file it stops with `REFUSED` and writes nothing (replacing approved Scenarios is a human edit in the Holdout repo). A malformed draft writes nothing. `put` prints no Scenario text and writes no run-log line. Keep the draft in a temp file outside this repo and run `put` as a single command: chained to anything (a pipe, `&&`), it loses the guard's exemption for the CLI, and one call keeps the push auditable. The input is a file so nothing has to be piped in.
- Without `--dir` it reads (and `put` writes, through a contents PUT) the file with `gh api` from `scenarios.holdoutRepo`, with the Holdout token (above). `--dir <path>` uses `<path>/<project-slug>/<milestone-slug>.md` in a local clone instead (`put` makes the project folder; the clone's commit and push stay with the human). Writing needs `contents: write` on the Holdout repo, which the read-only proof above does not cover.

| Exit | Verdict line | Meaning |
| --- | --- | --- |
| 0 | `SCENARIOS <command> <path>: <n> Scenarios` | Printed |
| 0 | `SCENARIOS put <path>: <n> Scenarios` | `put` created the milestone's file |
| 0 | `SCENARIOS <command> <path>: no Scenarios (no Holdout file)` | The milestone has no Holdout file. Not an error |
| 0 | `{"verdict":"SCENARIOS titles <path>: <n> Scenarios","path":"<path>","titles":[...]}` | `titles --issue`: the one JSON line (its `verdict` ends `no Scenarios (no Holdout file)` and `titles` is `[]` for a milestone without a file; `path` is `null` and the verdict says `the issue has no project or milestone` when the issue has none) |
| 2 | `USAGE: ...` | Unknown subcommand, a missing or repeated flag, a name with no letter or digit, or `--issue` with anything but `titles` and a key like `KIT-9` |
| 2 | `MALFORMED: <path>: <first problem> (+n more)` | The file (or, for `put`, the draft) breaks the format. Nothing is printed or written |
| 2 | `REFUSED: <path> already exists in the Holdout; ...` | `put` onto a milestone that already has a file. Nothing is written |
| 2 | `UNREADABLE: cannot read <file>: <cause>` | `put`'s `--file` cannot be read |
| 4 | `UNKNOWN: cannot read\|write <repo or file>: <cause>` | gh is down, Linear cannot be read (`titles --issue`), the token has no access, the repo does not exist, `--dir` is not a directory, the milestone file exists but cannot be read, or `put` cannot write (no `contents: write`, a file that appeared since the check). Any other unexpected error is also exit 4 with one `UNKNOWN:` line, never a stack trace |

The codes are ADR-0053's (`GATE_EXIT` in `scripts/lib/gates.mjs`). Exit 1 is not used by `titles`, `read` and `put`: none of them is a "no" verdict. The Milestone scenarios subcommands below use it.

## Milestone scenarios

The Milestone scenarios workflow (`.bb/workflows/milestone-scenarios.js`, ADR-0060) is how the Scenario judge runs one milestone's Scenarios against `development` and sets the `Scenarios` commit status on the promotion PR. Starting it: `docs/agents/bb-harness.md`. It drives these subcommands of the same CLI; a person can run each by hand.

```bash
node scripts/scenarios.mjs check  --project "<project>" --milestone "<milestone>" --pr <n>
node scripts/scenarios.mjs score  --scenarios <n> --verdicts 1:s:101,1:s:102,1:n:103
node scripts/scenarios.mjs status --sha <40 hex> --state pending
node scripts/scenarios.mjs status --sha <40 hex> --state error [--code <code>] [--run <id>]
node scripts/scenarios.mjs status --sha <40 hex> --scenarios <n> --verdicts <list> [--dry-run]
node scripts/scenarios.mjs report --project "<project>" --milestone "<milestone>" --sha <40 hex> --scenarios <n> --verdicts <list> [--dry-run]
node scripts/scenarios.mjs flow   --name scn-<nonce>-<i>
node scripts/scenarios.mjs run    --flow-run <producer run id> --name scn-<nonce>-<i>
node scripts/scenarios.mjs wait   --runs <id>,<id>,... --sha <40 hex> --timeout 480
node scripts/scenarios.mjs evidence --dir apps/mobile/.maestro/out   # device-flows.yml runs it
node scripts/scenarios.mjs access                                     # the token split, above
```

What the workflow does, in order:

1. **Session.** The harness check (as in the AFK developer), `run-log start --milestone <project-slug>/<milestone-slug>`, then `check`. A refusal posts nothing and ends the run as `refused`. Then `status --state pending` on the PR head. From here every stop posts `Scenarios` error (below); the status is never left pending by a run that returns.
2. **Flows.** One Scenario judge per Scenario (`claude-opus-5-5`, reasoning high, a fresh thread) runs `read` alone (the guard allows only one unchained CLI call), and writes that Scenario as one Maestro flow to `.factory/scenario-flows/scn-<nonce>-<i>.yaml` in the run's checkout (gitignored). `flow` then sends it to the Holdout repo's producer workflow (`scenario-flow.yml` there), which makes the run artifact `scenario-flow-scn-<nonce>-<i>` in the Holdout repo, and deletes the local file.
3. **Hosted runs.** `run` starts `runsPerScenario` hosted Device flows runs of every flow (`.github/workflows/device-flows.yml`, `flows: artifact`, ADR-0059), on `development`. `wait` runs in slices of 480 s, at most 30 slices (about 4 hours: macOS runners queue, and a cold native build took 41 and 58 minutes).
4. **Judge runs.** One fresh Scenario judge per run reads the Scenario through `read` and judges it from that run's evidence only, `.factory/scenario-runs/<run id>`: the step screenshots (`kc__*.png`; the flow writer takes one after every Action) and, when `ffmpeg` is on the machine, stills from the recording (`frames/`, one every 2 seconds, at most 60 per recording). Maestro also saves the screen at a failing step, as `<flow>/screenshots/step-NNN-<command>-<text>.png`; that name holds flow text, so `wait` renames each to `kc__<flow>__failure-NN.png` in the same folder (numbered in step order; `<flow>` is the Maestro flow folder when it is a flow name, else `maestro`), and on a `flow-failed` run the judge prompt names the highest-numbered one as the screen at the failing step. `wait` deletes every other downloaded file (the API log, the rest of Maestro's output: logs, `commands.json`, `screen-hierarchy/`), so the folder holds only `kc__*.png`, `kc__*.mp4` and `frames/`. Without `ffmpeg` the recording is not read, and the judge prompt says so. It never sees the diff or the code. Its schema'd verdict is `satisfied` or `not-satisfied`, with one sentence on where the Collector got stuck. It also writes that sentence to `.factory/scenario-sentences/<run id>.txt` (gitignored), which is how the sentence reaches `report` without passing through a command.
5. **Score.** `status --verdicts` scores and posts success or failure; the workflow logs the result. The score is final here: nothing after it can change `Scenarios`.
6. **Report** (KIT-354). One `report` call with the score's tokens (never a title or a sentence): it files one issue per failed Scenario and writes one comment on the milestone's project (below). The workflow returns the per-Scenario score, Satisfaction, the sha, every run judge's sentence and `report: {comment, filed, existing}`. It never moves an issue, merges or promotes. A `report` that fails (Linear unreachable, a malformed answer) leaves the score as posted: the returned note names the command to run by hand, and the run log gets the reason `report-failed`. The call is not retried by the workflow; running it again is safe, because a Scenario that already has an open failure issue is not filed twice.

The run log gets `start`, `spawn` (step `scenario-judge`, with thread, provider and model), `result` (outcomes `written`, `cannot`, `satisfied`, `not-satisfied`, then `met` or `not-met` with the sha) and `reason` lines, all with `--milestone <project-slug>/<milestone-slug>` in place of `--issue`; `run-log.mjs report` skips them. Every `read` adds its own `holdout` line, as above.

### The subcommands

- **`check`** asks Linear for the milestone's issues (`linear.mjs list --project --milestone`), then reads the PR (`gh pr view`), then the Scenario titles. It refuses (exit 1, one `REFUSED:` line naming the first cause) when the milestone has no issues; when any issue is not `Done` or `Canceled` (up to three keys and states named, then `(+n more)`), except the open failure issues `report` filed (see `report`), which let a re-run through so it can meet the Scenario again (nothing closes a failure issue but the work that fixes it); when the PR is not open, or does not go `lanes.integration` → `lanes.staging` (`development` → `staging`); and when the milestone has no Holdout file. Open, it prints one JSON line: `{"verdict":"SCENARIOS check <path>: <n> Scenarios on <sha8>","path":...,"sha":<the PR head>,"titles":[...],"runsPerScenario":3,"nonce":"<8 hex>"}`. The nonce makes the artifact names of one run unique. It reads titles only, so it logs no Holdout read.
- **The verdict list** is tokens only: `<scenario index>:<s|n>:<run id>`, comma-joined, `s` for satisfied. `--scenarios <n>` says how many Scenarios there are; every Scenario 1 to n needs exactly `runsPerScenario` entries and no run id may appear twice, or the list is usage (exit 2).
- **`score`** prints the score as one JSON line and posts nothing: per Scenario `{index, met, satisfied, runs}`, `passed`, `satisfaction` (satisfied runs over all runs, as `7/9 (78%)`) and `run`, the link run: the first run that did not satisfy its Scenario, else the first run. A Scenario is met at `satisfiedToMeet` (2) or more satisfied runs of `runsPerScenario` (3); the milestone passes only when every Scenario is met. Satisfaction is reported, never the gate. Exit 0 passes, 1 does not.
- **`status`** posts the `Scenarios` commit status on `--sha` (the PR head; it shows on that commit everywhere, not only on the PR). With `--verdicts` the state is worked out from the score, never passed in: success (`Every Scenario met (n/n). Satisfaction ...`) or failure (`m of n Scenarios met. Satisfaction ...`), linked to the link run. `--state pending` and `--state error` post a fixed description; `success` and `failure` by hand are refused. `--code` picks the error's description (`ERROR_CODES` in `scripts/lib/scenarios.mjs`; each is also a run-log reason code): `stopped` (the default), `hosted-run-error`, `development-moved`, `flow-not-written`, `producer-failed`, `dispatch-failed`, `judge-no-result`, `runner-no-result`, `wait-exhausted`, `bad-answer` (an answer that fails its pattern, or an exit nothing expects), `bad-command` (the CLI refused a command the workflow built: a bug), `status-failed` (the status post failed) and `github-unreachable` (GitHub could not be read); `--run <id>` links it to a run. `--dry-run` prints the payload and posts nothing. The link is built from the run id and `github.ownerRepo` only.
- **`report`** turns a score into Linear work. It takes the same `--scenarios` and `--verdicts` as `status` (checked the same way) and the milestone's names and the head `--sha`, and reads only the Scenario **titles** of the Holdout (as `check` does: it logs no `holdout` read, and no Scenario text is held past parsing). Exit 2 when the Holdout's Scenario count differs from `--scenarios`. In order:
  1. For each Scenario that is **not met**, unless an open issue of the milestone (state not `Done` or `Canceled`) already has the title `Scenario not met: <Scenario title>` (compared without case): `linear.mjs create "Scenario not met: <title>" --state To-do --label ready-for-agent --project <project> --milestone <milestone>`. The body holds the Scenario's title, one line per run (verdict, the judge's sentence, a link to `https://github.com/<ownerRepo>/actions/runs/<id>`), one acceptance criterion (`The next Milestone scenarios run meets "<title>"`), the line `write-scope: apps/mobile/**, apps/api/**, packages/**` (`FAILURE_WRITE_SCOPE`: a Scenario's fix area is unknown, so it is the product code; it keeps the planner from running it beside other app issues) and the footer line `Filed by Milestone scenarios (failure issue)`. **Never the Scenario's text.** An existing issue is listed under `existing` and never touched.
  2. One comment on the project (`linear.mjs project-comment`), always, also when every Scenario is met: `Milestone scenarios, <milestone> on <sha8>: Satisfaction <x/y (p%)>. Failed: "<title>", ... . Failure issues: KIT-n (new), KIT-m (already open).` or `Every Scenario met.`
  3. The sentence files it read are deleted, after everything is written.
  It prints one JSON line `{"verdict":...,"satisfaction":...,"comment":true,"filed":["KIT-n"],"existing":["KIT-m"]}`. `--dry-run` reads Linear and the Holdout, writes nothing and keeps the sentence files; it prints `wouldFile` (the titles) instead. If Linear fails part-way (exit 4) the line names the issues already filed and no comment is written; run `report` again and it files only what is missing.
  A sentence file is used only when it is one line of at most 400 characters (whitespace collapsed) with no control character and no backtick, and when it does not retell a Scenario: a sentence that shares `RETELL_WORDS` (6) or more consecutive words with a section body (Starting situation, Actions or End state) of any Scenario of the milestone is dropped. Case, punctuation, spacing and list numbers are ignored; each section is compared on its own, and the Scenario's title and the headings are not (the judge may name the title, which the issue carries). Otherwise the issue says `(no usable sentence from the judge)`. The filter catches a quote. It does not catch a paraphrase, a quote broken up by other words, or a section shorter than 6 words. Sentences and titles go to `linear.mjs` as body files and arguments of a child process (no shell), never through the workflow's runner commands.
  **The failure issue is marked by its footer line,** not only by its title: `linear.mjs list` reports `scenarioFailure: true` for an issue whose description has that line, and `check` lets an open issue through only when its title starts `Scenario not met:` **and** it has the footer. A hand-written issue titled `Scenario not met: ...` still blocks; so does one with the footer under another title. The footer is a marker, not a signature: anyone who can write an issue can copy it. The duplicate check is looser on purpose: any open issue with the failure title stops a second one.
- **`flow`** reads `.factory/scenario-flows/<name>.yaml`, deletes it, checks it has the `appId: app.kitcollective.mobile` line and is at most 60,000 characters, and dispatches the Holdout repo's `scenario-flow.yml` on the Holdout's `main` (`HOLDOUT_REF` in `scripts/lib/scenarios.mjs`) through `gh api .../dispatches --input -`, with `SCENARIOS_GH_TOKEN`: the flow travels in the request body on stdin, never in a command line or on stdout, and never to `kit-collective`. It asks GitHub for the run's id (`return_run_details`); when the answer has none it finds the run by its run name, `Scenario flow <name>`, which is unique per name (never "the newest run"). It waits for that run (`--timeout`, default 420 s; a run still unfinished then is exit 1, like a failed one) and prints `{"verdict":...,"name":...,"run":<id>}`. The id is a Holdout run's: it goes only to `run --flow-run`, never to `status --run` (that link is built from `kit-collective`).
- **`run`** dispatches `kit-collective`'s `device-flows.yml` on `development` with `flows=artifact`, `flow_run` and `flow_artifact=scenario-flow-<name>` the same way, with the `gh` login, and prints `{"verdict":...,"run":<id>}`. Its inputs are a run id and an artifact name, never flow text. `device-flows.yml` has no run name, so an answer without a run id is exit 4: no run is guessed. The hosted run downloads the artifact from the Holdout repo with `SCENARIO_FLOWS_TOKEN` (`docs/agents/device-flows.md`).
- **`evidence --dir <path>`** is what `device-flows.yml` runs on the hosted runner before it uploads an artifact run's evidence: the same rename and prune `wait` does (below), on Maestro's output folder, so `device-flows-<sha>` holds only `kc__*.png` and `kc__*.mp4`. One JSON line `{"verdict":...,"kept":<n>,"renamed":<n>}`, exit 0; a folder that does not exist (Maestro never started) keeps nothing and is exit 0 too.
- **`access`**: the proof of the token split, in "The Holdout token" above.
- **`wait`** reads each run (`gh api .../actions/runs/<id>` and its jobs). A run is judged only when the step `Run the flows` concluded `success` (run `flow-passed`) or `failure` (run `flow-failed`) on the checked sha; then its artifact `device-flows-<sha>` is downloaded to `.factory/scenario-runs/<id>`. One deadline, `--timeout` from the start, bounds the whole call, so a 480 s slice stays inside the 10 minute foreground cap: polling stops 120 s before it (a read of GitHub may run at most 60 s past it, each read capped), and every `gh run download` and ffmpeg call is stopped at it. What does not fit is exit 3; the next slice downloads only the runs not yet done (a finished run is marked by `.factory/scenario-runs/<id>.done`). When every run is judged and downloaded it prints one JSON line: `{"verdict":...,"runs":[{"run","outcome","evidence","frames"}]}`.

| Exit | Line | Meaning |
| --- | --- | --- |
| 0 | one JSON line | `check` open; `score` passed; `status` posted (pending, error or success); `report` wrote the comment and the issues; `flow` and `run` started their run; `wait`: every run judged and downloaded; `evidence` pruned the folder; `access`: `ambient denied, cli reads` |
| 1 | `REFUSED: ...` | `check`: the milestone, the PR or the Holdout file is not ready (nothing is posted) |
| 1 | one JSON line | `access`: the `gh` login still reads the Holdout, or `SCENARIOS_GH_TOKEN` is unset or cannot read it |
| 1 | one JSON line | `score` not passed; `status --verdicts` posted failure |
| 1 | `FAILED: the producer run <id> of <name> concluded <conclusion>` or `... did not finish in <t>s` | `flow`: the artifact was not made, or not within `--timeout` |
| 1 | `ERROR: hosted-run-error: run <id> ...` | `wait`: a run concluded `cancelled`, `timed_out`, `startup_failure` or anything but a flows step that succeeded or failed, it has no artifact, or its flows step failed and its evidence holds no screenshot at all (no `kc__*.png`, before stills; Maestro or the Simulator did not start, as in run 38801470319). An error, never a verdict; the run's folder is removed and not marked done |
| 1 | `ERROR: development-moved: run <id> ran <sha8>, not <sha8>` | `wait`: `development` moved between `check` and the dispatch (`--ref` takes a branch), so the run tested another commit |
| 2 | `USAGE: ...`, `MALFORMED: ...`, `UNREADABLE: ...` | Bad flags, a bad verdict list, a malformed Holdout file (`check`, `report`), a Holdout whose Scenario count is not `--scenarios` (`report`), a missing or foreign flow file (`flow`) |
| 3 | `WAITING: <n> of <m> hosted runs unfinished` or `WAITING: evidence of <n> of <m> hosted runs not downloaded yet` | `wait`: run it again; it resumes |
| 4 | `UNKNOWN: ...` | Linear (`check`, `report`), the PR, a run or the status post cannot be reached (`github-unreachable`, `status-failed`); a dispatch failed or returned no run id (`UNKNOWN: cannot dispatch ...`, `UNKNOWN: the dispatch of ...`: `dispatch-failed`; a Holdout call made without `SCENARIOS_GH_TOKEN` says so at the end); `access` could not probe the Holdout for another reason than a denial |

**Errors.** A hosted run that fails or stops early ends `Scenarios` as error, never pending: `wait`'s `ERROR:`, a failed producer or dispatch, a flow the judge cannot write, a judge with no usable verdict after two tries, a lost runner result and a wait still unfinished after 30 slices each post `status --state error --code <code>`. Every exit of every CLI call the workflow makes maps to the code that names what happened (`causeOf` in the workflow); an error status that cannot be posted is logged as `status-failed` and named in the run's note. A failed Maestro flow is not an error: it is a judged run (`flow-failed`), and the judge decides from what it captured. A failed flow that captured no screen at all is the exception: nothing reached the app, so it is `hosted-run-error`. Run Milestone scenarios again after an error; a new run posts pending again. **The one case a workflow cannot catch** is its own thread dying after pending: `Scenarios` then stays pending. Post the error by hand, `node scripts/scenarios.mjs status --sha <sha> --state error`, or run the workflow again.

**What the Scenario text can reach (KIT-366).** The flow the judge writes is the Scenario in another form. It never enters this repo, a run-log line, a verdict line, a status, a command line, the workflow's output or any prompt but the flow writer's own, and `flow` deletes the local file once it has read it. Since KIT-366 it is not in any `kit-collective` run either:

- The producer runs in the Holdout repo: the flow is in that run's dispatch inputs and in its artifact `scenario-flow-<name>` (kept 1 day), both readable only by who can read the Holdout. `kit-collective` has no `scenario-flow.yml`; a hand-written test flow goes through the same producer (`flow --name`, from `.factory/scenario-flows/<name>.yaml`).
- The hosted run in `kit-collective` gets a run id and an artifact name as inputs, downloads the flow with `SCENARIO_FLOWS_TOKEN`, writes Maestro's console to a file on the runner that is never uploaded (the log shows only the exit code), runs `evidence` and uploads only `kc__*.png` and `kc__*.mp4` as `device-flows-<sha>` (kept 14 days), without the API log. Left in that artifact: the screenshots and recordings themselves (what the app showed), their names (`kc__<flow name>__NN-<what it shows>`, words the flow writer chose), and the Maestro folder names above them (the flow's `name:`, `scn-<nonce>-<i>` for the judge's flows).
- bb-harness's `GH_TOKEN` selects `kit-collective` only, so the AFK developer's `gh` cannot read the Holdout's files or artifacts; `access` proves it on the machine.

What stays possible, and is not fixed here (the same stance as the guard, below: the ordinary route is closed and the run log shows the rest): `SCENARIOS_GH_TOKEN` sits in the same `.env` every bb thread on bb-harness can read (the AFK developer's `titles --issue` needs it), so a thread that reads it on purpose, or a command that builds the Holdout's name at runtime, gets past the guard. A branch workflow pushed with `GH_TOKEN` (it has Workflows write) could use `SCENARIO_FLOWS_TOKEN`. Desktop sessions on the Mac use the approver's own `gh` login, which reads everything.

The run judges' sentences are told not to retell the Scenario, but they are model text: they are returned in the workflow output and, since KIT-354, written into the failure issues `report` files (a Linear issue anyone on the team reads). `report` drops a sentence that quotes a Scenario (6 or more consecutive words shared with its text, see `report`), so the failure issue holds the title and the sentences that passed; a paraphrase still passes.

## The guard and the read log

`.claude/hooks/holdout-guard.mjs` is a PreToolUse hook, registered for `Read|Grep|Bash` in `.claude/settings.json` next to the ratchet hook, so it applies to every Claude Code thread in this repo. The Holdout's name comes from `scenarios.holdoutRepo` in `factory.config.json`.

Denied (exit 2, with a message that points at the CLI):

- Read or Grep on a path with a Holdout clone's directory name as a segment, or with the working directory inside a clone.
- Bash from inside a clone, any command with such a path in it (`cat`, `rg`, `ls`, ...), a bare word that names an existing directory of that name in the working directory (`ls kit-scenarios`), `cd` into that name, and any `gh` or `git` command that names the Holdout. Every word is checked, also behind redirections (`<`, `>`, `<<<`), subshells and `<(`/`>(` substitutions. The CLI exemption does not hold when a command separator (`;`, `&`, `|`, a newline), `$(`, a backtick or a `<(`/`>(` substitution is added to it; a plain redirection on the CLI is allowed, since the CLI reads no stdin. The name is compared without regard to letter case.
- Input the hook cannot parse, or a config it cannot read (it fails closed).

Allowed: one `node scripts/scenarios.mjs ...` invocation with nothing chained to it (also with `--dir` at a clone), and everything else, including a bare mention of the name such as `rg kit-scenarios docs/`. The guard does not watch these routes: Glob, Edit and Write on a clone path; WebFetch; the GitHub MCP tools; and a Grep or `rg foo .` run from the clone's parent folder (the search walks into the clone, and the hook sees no Holdout name in the command).

Every `read` appends one line to the run log before it fetches anything, so a read of a missing or malformed file is logged too. The shape is fixed (ADR-0052):

```json
{"at":"2026-10-15T16:20:00.000Z","event":"holdout","code":"holdout-read","holdout":"holdout-scenarios/holdout.md","thread":"thr_abcd1234"}
```

`thread` is the reading thread's `BB_THREAD_ID`; a read outside a bb thread has none. If the line cannot be written, `read` prints no Scenario text and ends `UNKNOWN: cannot log the read: ...` (exit 4). See the reads with `grep '"holdout"' "$(node scripts/run-log.mjs path)"`. The log is machine-local (ADR-0052): a read on another machine lands in that machine's file.

### The stance: provenance, not unforgeability

The guard makes the Holdout's contents arrive by one route and leaves a record of it. It does not make the Holdout unreadable (ADR-0060; `CONTEXT.md` says not to claim it cannot be read). A thread that builds the repo name at runtime, runs `node -e` or a script that calls `gh`, or starts a child process gets past the hook. So does a Cursor agent: Cursor has no Read or Grep hook event, so the guard covers Claude Code threads only. What the guard buys is that an honest thread cannot read the Holdout by accident, and that the log shows a read happened and by which thread. A read that is not in the log did not come through the CLI.
