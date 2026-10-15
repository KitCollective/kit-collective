# Scenarios: the Holdout repo, the file format and the CLI

Where the Holdout lives, how a milestone's Scenarios are written, and the one command that reads and writes them. Terms (Scenario, Holdout, Scenario judge, AFK developer, Milestone scenarios) are in `CONTEXT.md`; the decisions are ADR-0060.

## The Holdout repo

- A private GitHub repo, named by `scenarios.holdoutRepo` in `factory.config.json` (`KitCollective/kit-scenarios`). `factory.config.example.json` has the same block.
- One Markdown file per milestone: `<project-slug>/<milestone-slug>.md`. A slug is the Linear name lowercased with each run of characters other than letters and digits turned into one `-` (`Holdout Scenarios` is `holdout-scenarios`).
- The milestone `Fixture` of the project `Holdout Scenarios` is a fixture file for tests and demos: `node scripts/scenarios.mjs titles --project "Holdout Scenarios" --milestone Fixture`. It holds no real Scenarios. The setup for a fresh Holdout repo is `docs/agents/scenarios-repo-wizard.sh`.
- Reading it needs the credential every machine already has: `GH_TOKEN` (`bb.env`) with the `repo` scope and access to the org. No new secret name. Prove a machine's read with the fixture command above: it exits 0 and ends with `SCENARIOS titles ...: 2 Scenarios`, and exit 4 names the cause.
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
- Without `--dir` it reads (and `put` writes, through a contents PUT) the file with `gh api` from `scenarios.holdoutRepo`. `--dir <path>` uses `<path>/<project-slug>/<milestone-slug>.md` in a local clone instead (`put` makes the project folder; the clone's commit and push stay with the human). Writing needs `contents: write` on the Holdout repo, which the read-only proof above does not cover.

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

The codes are ADR-0053's (`GATE_EXIT` in `scripts/lib/gates.mjs`). Exit 1 is not used: nothing here is a "no" verdict until the Scenario judge scores Satisfaction.

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
