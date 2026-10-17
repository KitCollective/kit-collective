# Optio: install, reload, update

Optio is the bb plugin in `plugins/factory/` (plugin id `optio`, CLI `bb optio`; CONTEXT.md: **Optio**, ADR-0062). It runs inside the bb server on the owner's Mac and holds the Staff agents (Max, the Orchestrator), their memory and the Board. This page is how to get a merged change into the running plugin.

## The `bb` that builds it must match the app

`bb plugin build` compiles against the plugin SDK of the `bb` on your PATH, not the app's. The global npm package `bb-app` does not update itself with the desktop app: on 2026-10-17 it was 0.41.0 (SDK 0.4.34) while the app was 0.46.0, and the build failed on `experimental_Icon`. Check both before building:

```bash
bb --version
defaults read /Applications/bb.app/Contents/Info CFBundleShortVersionString
```

When they differ: `npm install -g bb-app@<app version>`. `bb plugin types --check plugins/factory` then says `pin is 0.6.37, host is 0.6.37`.

## First install (done 2026-10-17, KIT-358)

From the main checkout, on `development`:

```bash
pnpm install --frozen-lockfile --filter @kit/bb-plugin-optio...
bb plugin build plugins/factory
bb plugin install path:$PWD/plugins/factory --yes
```

Then the agents are created through the plugin's RPC (`agent_create`); Max's instructions are the system prompt in `staff/max.md`. The Board is set up on the plugin's page (Agents, Board) and starts in `dry-run`; see the next section.

## The Board reads the `loops` registry

What the Board starts is the `loops` block of `factory.config.json` in the project checkout, read on every tick through `bb.sdk.projects.fileContent` (the bb project's root, which on the owner's Mac is the main checkout). Editing the file on `development` changes the next tick; nothing is reloaded.

Each Loop has a `name`, a `trigger`, the `workflow` it runs (a file in `.bb/workflows/`), the `machines` it may use (ids as the page names them) and `maxLive`, how many of its runs may be live at once.

- `issue` trigger: `state`, `label`, `unblocked`, `skipLabels`, `priorityOrder`. It repeats the `dispatch` block of `factory.config.json` (the eligibility rules `WORKFLOW.md` defines), and a plugin test fails when the two differ. AFK developer is registered with it.
- `milestone-done` trigger: `states`. Defined, and it must stay `enabled: false`: a registry that switches it on is refused until the Board can match it.

Rules the Board keeps across Loops: a machine's `cap`, write-scope overlap with work in progress or an earlier start, the focus milestone first, and `flow.maxRunsPerDay` (starts of one issue in 24 hours, resumes included). A Loop that names a machine the page does not have makes its issues wait with `no machine "x"`.

A registry that does not parse (bad JSON, an unknown trigger, a duplicate Loop name, a negative `maxLive`) is refused: the Board plans, starts and moves nothing, `bb optio board` exits 1 and says why, the page shows the reason, and a `refusal` row is written. Every start, skip and refusal is a row in the plugin's record of runs (the `decisions` table), shown on the page under "Record of runs". A wait is written again only when its reason changes.

The setup form keeps the operating settings only (backlog, active and blocked states). A board stored before this change keeps its `workflow`, `dispatchState`, `readyLabel`, `skipLabels` and `priorityOrder`; the Board ignores them.

In `dry-run` the scheduled tick still reads the registry and records what it would start (`mode` is `dry-run` on the row) and applies nothing. That is the evidence for a registry change: `bb optio board --json` and the page show the Loops and the plan.

## The hand-over on the recorded review gate (KIT-364)

The AFK developer ends a green run ready in `In Review` and writes no `Approval` itself (ADR-0062). The Board moves the issue to `Approval` when it closes the ended run, if the review gate `optio_gate` recorded is green on the pull request's current head. It is off until the states are set:

```bash
bb optio hand-over --review "In Review" --approval Approval
bb optio hand-over            # shows the setting
bb optio hand-over --off      # back to: an ended run in a working state is a stall
```

It needs `github.ownerRepo` and `agent.workpadHeading` in `factory.config.json` (both are there) and `gh` on the machines the gates run on. Evidence for a run: the dispatch row (`bb optio dispatches`) ends `handed-over` with outcome `Approval`, `bb optio gates` shows the `review` record, and the Linear history shows the move by the Linear API key's user. With `flow.autoLand.enabled` on, a run takes the auto-land path and never reaches this hand-over.

## After a merge that touches `plugins/factory/`

```bash
bash scripts/sync-development.sh
pnpm install --frozen-lockfile --filter @kit/bb-plugin-optio...
bb plugin build plugins/factory
bb plugin reload optio
```

The install is by path, so `reload` picks up the rebuilt `dist/` and keeps the plugin's settings, agents and memory. Never `bb plugin remove optio` to update it: removing deletes its database (agents, memory, automations).

## What it replaced

The Meta Agents plugin (`bb meta-agents`, folder `~/Projects/bb-plugin-meta-agents`, repo `KitCollective/bb-plugin-meta-agents`) was removed on 2026-10-17. Its agents were Orchestrator, Max, DevOps and Frontend; the Orchestrator's five automations and four Linear triggers were all disabled and had never run, so none was carried over (KIT-358).

## Live checks

What only the running plugin can prove (it builds and reloads, the host bundle probes a thread, the Board answers) is a named live check in `scripts/lib/live-checks.mjs`: `optio-reload`, `optio-host-probe` and `optio-board`. `node scripts/live-check.mjs list` shows them and `node scripts/live-check.mjs run <name> [--thread thr_x]` runs one from the main checkout, with one `LIVE-CHECK <name> pass|fail <line>` verdict. An issue names its checks on a `live-check:` line, and Max's live-check automation runs them after the merge (`staff/max.md`, Live checks). A new check is a reviewed change to that file, never text from an issue.
