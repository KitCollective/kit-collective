Standing agents for your project, such as an orchestrator, a devops agent or a
frontend agent, each with its own instructions, memory and recurring tasks.

## What you get

- An **Agents** page in the sidebar where you create agents, write their
  instructions and start a chat with one.
- A memory per agent. The agent saves decisions and durable facts while you
  talk, and reads them at the start of every later session; you can edit the
  list.
- Automations per agent: a schedule that gives the agent a task or starts a bb
  workflow.
- A board for the orchestrator: it reads the project's Loop registry and a
  Linear team's issues every minute, starts each Loop's workflow for the issues
  its trigger matches within each machine's capacity, takes a focus milestone
  first, records every start, skip and refusal, and reports a run that stopped
  at a gate.
- A `bb optio` command for the same data from a terminal, and a
  token-guarded route so another system can start an agent.

## How it works

Agents, memory and automations live in the plugin's own database on the bb
server. Starting an agent opens an ordinary bb thread that is told to load the
agent's brief first.

The only external service the plugin calls is Linear's API, and only for the
board: to read issues and to move an unblocked issue back to the first
issue Loop's state. The Linear key is a secret setting and stays on the server.

## For agents

The bundled skill tells an agent how to load its brief, when to save a memory,
and how the orchestrator handles a stopped run.
