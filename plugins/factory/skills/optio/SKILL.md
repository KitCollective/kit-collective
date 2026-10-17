---
name: optio
description: Work as, or manage, a standing agent of the Optio plugin: load an agent's brief and memory, save a decision to its memory, read the orchestrator's board, set a milestone focus, and handle an `[optio]` report of a stopped run. Use when your instructions name you a standing agent, when the user asks what is running or waiting, asks to focus on a milestone, or asks to add or change an agent or automation.
---

# Optio

An agent is a name, a project and standing instructions, plus the memory it
has saved. The user creates and edits agents, their memory and their
automations on the **Agents** page in the bb sidebar; the commands below are the
same data from a shell.

## If you are a standing agent

Your thread instructions name you and your agent id.

1. Run `bb optio brief <agent>` before anything else. It prints your
   instructions and your memory, newest first. Follow them.
2. When you and the user decide something, or you learn something durable about
   your area, save it at once as one self-contained sentence:
   `bb optio memory add <agent> "<fact>"`.
   Save what a later session needs and cannot read from the code: a decision
   and its reason, a preference, a pitfall. Do not save status or what you just
   did.
3. When a memory is wrong or was replaced: `bb optio memory remove <memory-id>`.

4. To look into something later, or in a thread of its own, schedule a
   follow-up instead of waiting:
   `bb optio follow-up add <agent> --in 2h --task "<what to investigate>"`
   (`--at "2026-10-13T08:00"` for a clock time; neither to start now). It opens
   a new thread of you at that time. That thread's last message is delivered
   to the thread you scheduled it from, as an `[optio] Report …` message.

## In the composer

The user addresses an agent from any composer by typing `@` and picking it
under Agents, or with the Agent picker beside the send button. The message then
carries that agent's brief as context: when you see "The user addressed the …
standing agent", act as that agent for the message.

## Commands

| Command | Effect |
| --- | --- |
| `bb optio list [--json]` | The agents, with their memory and automation counts. |
| `bb optio brief <agent>` | The agent's instructions and memory. |
| `bb optio memory add <agent> <text>` | Save one memory (1 to 2000 characters). |
| `bb optio memory list <agent> [--json]` | The agent's memory with ids. |
| `bb optio memory remove <memory-id>` | Delete one memory. |
| `bb optio trigger <agent> --task "<task>"` | Start a new thread of the agent with a task. |
| `bb optio follow-up add <agent> --task "<task>" [--in <duration> \| --at <time>]` | Schedule a new thread of the agent that reports back to the calling thread. At most 30 days ahead. |
| `bb optio follow-up list [--agent <id>]` | Follow-ups that are waiting or running. |
| `bb optio follow-up cancel <id>` | Cancel a follow-up that has not started. |
| `bb optio runs [--agent <id>] [--limit <n>]` | Recent sessions: chats, automations, triggers. |
| `bb optio gates [--limit <n>] [--json]` | The gate runs `optio_gate` recorded, newest first. |
| `bb optio urls` | The routes other systems call. |

Agents, instructions and automations are created and changed on the Agents
page, not from a shell.

## Gates

The agent tool `optio_gate` runs one of the repo's flow gates (`pre-review`,
`review`, `land`) with a PR number and an issue key, on this thread's machine in
its worktree. Optio records the exit code, the verdict line, the commit SHA, the
gate and your thread id, and returns the same record: go by its `exitCode`
(0 open, 1 closed, 3 waiting, 4 unknown). An unknown gate or a malformed
argument is refused and recorded, never run.

## Automations

An automation belongs to an agent and runs on a schedule. It either gives the
agent a task (a new thread of the agent, briefed as above) or starts a named bb
workflow, `.bb/workflows/<name>.js` in the agent's project, with arguments. A
workflow is started by a short launcher thread that runs one
`bb workflows run` command; follow the workflow with `bb workflows list`.

Automations fire only while bb runs; a fire time that passed while bb was down
runs once when it is back.

## Linear triggers

On an agent's Automations tab the user adds triggers: a Linear team, optionally
one project, and an event (an issue is created, moves to a status, or gets a
label), plus the task. The plugin asks Linear once a minute what changed and
starts the agent in a new thread with the issue attached as data.

- The first check after the first trigger is added only records what exists;
  nothing fires for it.
- An issue the plugin has never seen and that was not just created yields no
  event the first time, because its earlier status is unknown.
- Comments and other Linear objects are not events.

## The board

The board is the orchestrator's standing half. In `live` mode, every minute, it
reads the team's issues from Linear and:

- reads the Loop registry (the `loops` block of `factory.config.json` in the
  project checkout) first, on every tick. A registry that does not parse is
  refused: nothing starts and the reason is recorded;
- starts the Loop's workflow for each issue that is in the Loop's state,
  carries its ready label and none of its skip labels, has no open blocker,
  does not overlap the write scope of work in progress, belongs to a Loop
  with a free live-run slot, has not been started `flow.maxRunsPerDay` times in
  24 hours, and fits one of the Loop's machines with a free slot and the
  capabilities the issue needs. Order: focus milestone, then the Loop's
  priority order, then age. An issue it started before is started with
  `resume`. Every start, skip and refusal is written to the record of runs;
- when "refill the queue from the backlog" is on and the ready queue has room, asks the
  orchestrator agent, at most once per half hour, to choose backlog issues to
  promote. The orchestrator promotes with `bb optio promote`; the workflow
  the board then starts is what moves the issue on to an active state;
- moves a blocked issue back to the first enabled issue Loop's state once every
  blocker is completed or canceled;
- closes its runs that ended. A run whose issue is still in the dispatch state
  or a working state **stalled**: it stopped at a gate. The board never restarts
  a stalled issue by itself and never merges; it reports the stall to the
  orchestrator agent's thread in an `[optio]` message.

The Loops' states, labels and workflows come from the registry; the backlog,
active and blocked states are the board's configuration, set when it is set up.
The plugin names none itself. Mode, focus, machines, capacity and routing rules
are edited on the Agents page under Board.

| Command | Effect |
| --- | --- |
| `bb optio board [--json]` | The Loops, open issues per state and milestone, what runs, what starts next, why each other ready issue waits, and the newest entries of the record of runs. Says why and exits 1 when the registry is refused. Reads Linear; writes nothing. |
| `bb optio focus set "<milestone>"` | That milestone's issues go first; others fill the capacity left. |
| `bb optio focus clear` | Back to priority order. |
| `bb optio promote <issue> --reason "<why now>"` | Move a backlog issue to the first enabled issue Loop's state with its ready label and the reason as a comment. Refused when the registry is refused, the issue is not in the backlog, is blocked, carries a skip label, or the queue (running plus ready) already equals the machines' capacity. Live mode only. |
| `bb optio resume <issue> [--machine <id>]` | Start a stalled issue's workflow again with `resume`. Refused at the attempt cap or when the machine is full. |
| `bb optio release <issue>` | Clear a stall after the issue was parked or fixed by hand. |
| `bb optio dispatches [--limit <n>]` | The workflow runs the board started. |

### When an `[optio]` message arrives

1. Read what it says is known, then the workflow run (`bb workflows status
   <run-id>`), the project's run log and the pull request's checks. Name the
   gate that failed.
2. If another run can fix it: `bb optio resume <issue>`.
3. If a person is needed, or the message says the cap is reached: park the
   issue the way the project's workflow document says, then
   `bb optio release <issue>`.

## Triggers from outside

`POST /api/v1/plugins/optio/http/trigger` with header `x-bb-plugin-token`
(`bb plugin token optio`) and body
`{ "agent": "<id>", "task": "…", "payload": {…}, "deliveryId": "<optional dedupe id>" }`
starts an agent whose "Other systems may start this agent over HTTP" box is
ticked. The payload reaches the agent as data, not as instructions.

## Limits

- Memory is the plugin's own list per agent. It is not shared between agents
  and is not the user's or the project's memory.
- An agent's thread learns its role from a short instruction that points at the
  brief. A thread that skips step 1 works without its instructions and memory.
- Write scope is read from the `write-scope:` line of the issue description
  only, and overlap is judged by the part of each glob before its first
  wildcard.
- Capacity counts only runs the board started.
- The `paused` setting stops the board, the automations and the HTTP trigger.
  Chats still work.
