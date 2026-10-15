# Scenarios: the Holdout repo, the file format and the CLI

Where the Holdout lives, how a milestone's Scenarios are written, and the one command that reads them. Terms (Scenario, Holdout, Scenario judge, AFK developer, Milestone scenarios) are in `CONTEXT.md`; the decisions are ADR-0060.

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

`scripts/scenarios.mjs` is the only reader of the Holdout (KIT-348 adds the guard that denies direct reads, and the read log).

```bash
node scripts/scenarios.mjs titles --project "Holdout Scenarios" --milestone "Holdout"
node scripts/scenarios.mjs read   --project "Holdout Scenarios" --milestone "Holdout"
```

- `titles` prints one title per line. `read` prints each Scenario in full. Both end with one verdict line, the last line on stdout.
- Without `--dir` it reads the file with `gh api` from `scenarios.holdoutRepo`. `--dir <path>` reads `<path>/<project-slug>/<milestone-slug>.md` from a local clone instead.

| Exit | Verdict line | Meaning |
| --- | --- | --- |
| 0 | `SCENARIOS <command> <path>: <n> Scenarios` | Printed |
| 0 | `SCENARIOS <command> <path>: no Scenarios (no Holdout file)` | The milestone has no Holdout file. Not an error |
| 2 | `USAGE: ...` | Unknown subcommand, a missing flag or a name with no letter or digit |
| 2 | `MALFORMED: <path>: <first problem> (+n more)` | The file breaks the format. Nothing from it is printed |
| 4 | `UNKNOWN: cannot read <repo>: <cause>` | gh is down, the token has no access, the repo does not exist, or `--dir` is not a directory |

The codes are ADR-0053's (`GATE_EXIT` in `scripts/lib/gates.mjs`). Exit 1 is not used: nothing here is a "no" verdict until the Scenario judge scores Satisfaction.
