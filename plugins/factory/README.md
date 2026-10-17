# Optio

Standing agents for [bb](https://getbb.app): an orchestrator, a devops agent, a
frontend agent, or whatever areas a project has. Each agent has its own
instructions, a memory that grows as you decide things with it, and
automations that run recurring work.

Everything is set up on the **Agents** page in the bb sidebar.

## What an agent is

- **Instructions**: its area, its rules, what it may touch.
- **Chat**: "Start chat" opens a new bb thread as the agent. The thread first
  runs `bb optio brief <agent>`, which prints the instructions and the
  memory.
- **Memory**: one-sentence facts and decisions. The agent saves them with
  `bb optio memory add` while you talk; you can add, correct and remove
  them on the page.
- **Automations**: a schedule plus either a task for the agent or a named bb
  workflow (`.bb/workflows/<name>.js`) to start with arguments.
- **Linear triggers**: start the agent when an issue of a chosen team (and
  project) is created, moves to a status or gets a label. Polled once a minute.
- **Follow-ups**: the agent schedules a new thread of itself for later with
  `bb optio follow-up add`; the report comes back to the thread that asked.
- **In the composer**: type `@` and pick an agent, or use the Agent picker
  beside the send button, to address an agent from any thread.
- **HTTP trigger** (optional): another system starts the agent with a task.

## The board

The Board view is the orchestrator's scheduler. Every minute it reads the
**Loop registry**, then a Linear team's issues, and starts each Loop's workflow
for what its trigger matches, in focus-milestone and priority order, within
each machine's capacity and without write-scope overlap. A run that stops at a
gate is reported to the orchestrator agent's thread, which resumes it or parks
it.

The Loop registry is the `loops` block of `factory.config.json` in the
project's checkout, read through `bb.sdk.projects.fileContent` on every tick,
so an edit is picked up at the next tick without a reload. Each Loop has a
name, a trigger, the workflow it runs, the machines it may use and a live-run
cap. An `issue` trigger names the state a ready issue waits in, the label that
marks it ready, whether a blocker holds it, the labels that skip it and the
priority order. A `milestone-done` trigger (every issue of a milestone in a
finished state) is defined and must stay `enabled: false`. A registry that does
not parse is refused: nothing is planned, started or moved, the page and
`bb optio board` say why, and the refusal is written to the record of runs.
`flow.maxRunsPerDay` in the same file caps how often one issue is started in 24
hours.

The page keeps the operating settings: the backlog, active and blocked states,
mode, focus milestone, machines, capacity and routing rules. They are form
fields. A new board starts in `dry-run`: it reads the registry, shows the plan,
records what it would do and starts nothing. The page's "Record of runs" lists
every start, skip and refusal with its reason; a wait is written again only
when its reason changes.

## Install

The plugin is the workspace package `@kit/bb-plugin-optio` in `plugins/factory`.
From the repository root:

```bash
pnpm install
bb plugin install plugins/factory
```

Then, under Settings → Installed plugins → Optio, set the Linear API key
(or the path of a dotenv file with `LINEAR_API_KEY`) if you use the board.

The seed under `examples/` creates three agents and a board through the
plugin's RPC; read it as an example of the shapes. It is the only place in the
plugin that names one product's team key, labels and states: the plugin reads
them from the board's configuration and the project's Loop registry.

## Triggering an agent from another system

```bash
curl -X POST "$BB_URL/api/v1/plugins/optio/http/trigger" \
  -H "content-type: application/json" \
  -H "x-bb-plugin-token: $(bb plugin token optio)" \
  -d '{"agent":"devops","task":"CI failed on main.","payload":{"run":1234}}'
```

The agent must allow the HTTP trigger. bb's `getbb.app` URL and `bb connect`
shares require the owner's session, so a caller outside the machine needs its
own tunnel to that one path.

## Layout

| Path | What it holds |
| --- | --- |
| `server.ts` | Registrations only: settings, schedules, routes, RPC, the CLI. |
| `app.tsx` | The Agents page: agent list, one agent, the board. |
| `src/contract.ts` | The RPC contract shared by server and page. |
| `src/agent-store.ts` | Agents, memory and automations in the plugin's SQLite database. |
| `src/sessions.ts` | Starting an agent thread; the brief; due automations; workflow launchers. |
| `src/store.ts` | The ledger of agent sessions. |
| `src/scheduler-config.ts` | The board's stored configuration. |
| `src/linear-api.ts` | Reads the team's issues from Linear; moves an unblocked issue. |
| `src/board.ts` | The plan for one tick: starts, machines, and why the rest wait. |
| `src/scheduler.ts` | A tick: close ended runs, plan, start, report stalls; `resume`. |
| `src/dispatch-store.ts` | The ledger of workflow runs the board started. |
| `src/linear-triggers.ts` | The poller that turns Linear changes into agent sessions. |
| `src/linear.ts` | Linear webhook signature check. |
| `host.ts` | The host bundle, run on each enrolled machine: runs the fixed probe script and the fixed gate script (`scripts/gate.mjs`) in a worktree. |
| `src/host-contract.ts`, `src/host-run.ts` | The host bundle's RPC contract and its script runner. |
| `src/host-probe.ts` | Thread id to worktree and machine, then the host bundle's probe (`bb optio host-probe <thread>`, the `optio_host_probe` agent tool). A spike. |
| `src/gate-tool.ts` | The `optio_gate` agent tool: validate a gate call (a gate from a fixed set, a PR number, an issue key), run the repo's gate script on the calling thread's machine, record the result. An unknown gate or a bad argument is refused and recorded, never run. |
| `src/gate-store.ts` | The record of gate runs (`bb optio gates`): gate, thread, PR, issue, outcome, exit code, verdict line, commit SHA. |
| `scripts/host-probe.mjs` | The fixed, read-only script the probe runs. |
| `src/product-neutral.test.ts` | Fails when plugin code outside `examples/` names one product's values. |

`src/dispatch.test.ts` tests `src/sessions.ts` and `src/agent-store.ts`; the
file kept its name from the module those replaced.

## Develop

```bash
pnpm --filter @kit/bb-plugin-optio test       # vitest: pure logic plus the fake plugin host
pnpm --filter @kit/bb-plugin-optio typecheck
pnpm test:optio                               # both, as CI runs them
bb plugin dev plugins/factory                 # rebuild and reload on save against a running bb
```
