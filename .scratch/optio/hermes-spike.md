# Hermes spike: Staff on Hermes vs Staff on bb (one week)

Plan, 2026-10-15. Decided in conversation: Max keeps running on bb this week (dispatch and triage, ADR-0063); beside it, Hermes gets one week to show whether Optio's Staff belong on Hermes Agent instead of the meta-agents plugin. Background: Hermes' **Bot Mode** gives named bots their own model, memory, skills, routines and chats, and bots can work together through group chats and @mentions (<https://hermes-agent.nousresearch.com/docs/>), which is what Staff are.

## The split being tested

- **Staff on Hermes think and talk**: triage, shaping tickets, priorities, the daily status, nudging Nicklas. They write to Linear as the Max app (client credentials, `.scratch/optio/max-linear-app.sh`).
- **Optio on bb executes**: the dispatch tick (later the Board) reads Linear and starts AFK developer runs with gates, Holdout and auto-land.
- **Linear is the only bus.** Hermes gets no repo, no git, no bb, no product secrets: only Linear (as Max) and one chat channel. That keeps the private-data + untrusted-content + outward-action risk to Linear writes Max may make anyway.

## Setup (human steps, then the week)

1. The Max Linear app exists (the wizard).
2. A Hermes project on the Hetzner server (`optio`), isolated like any other project there (`~/Projects/server/bin/new-project.sh hermes`): its own Compose project, memory limit, no Postgres superuser, no access to the bb-harness container.
3. Hermes installed in that project's container; a model provider key for it (Hermes needs its own; this is the spike's main cost).
4. One chat channel: Telegram (a bot from BotFather) or Slack (an app in the workspace). Nicklas picks.
5. One bot in Bot Mode: Max, with the system prompt from `staff/max.md` cut to triage and the daily status, and a Linear tool that uses the Max app's client credentials.
6. When the Hermes bot goes live, the bb tick stops triaging (one line in `staff/max/tick.js`: no triage list) so two Maxes never triage the same issue. Dispatch stays in bb.

## What decides it after the week

| Question | How it is measured |
| --- | --- |
| Are triage verdicts as good? | Nicklas rates 10 verdicts from each week (bb-Max's week and Hermes-Max's week): right, wrong, or "would have asked" |
| Is it faster? | Time from an issue entering Triage to its verdict |
| Does Nicklas use the channel? | Messages answered in the chat vs the bb thread |
| Does memory help? | Repeated questions or repeated mistakes across the week |
| What does it cost? | Hermes provider spend vs the bb threads' spend for the same work |
| What broke? | Incidents: wrong writes, missed issues, the container down |

If Hermes wins: Chris, Sophie and Brad are hired on Hermes too, meta-agents is retired, and KIT-357/358 change aim (Optio keeps the Board, the Loop registry, the gate tool and the runs page; the Staff part moves out). If bb wins: Hermes is parked again, and Staff stay in Optio.

## Not in the spike

Hermes starting runs, reading the repo, or holding any secret other than the Max app's credentials and its chat token. Marketing bots.
