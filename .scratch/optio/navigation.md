# Optio navigation and Inbox: decisions so far

Input for `/grill-with-docs` and `/to-spec`; not a spec. Nicklas, 2026-10-17, from a screenshot of the bb
sidebar: one flat list of about 60 threads, most of them Max's five-minute ticks, and KIT-365 twice.

## Decided

1. **One thread per issue, for its whole life.** Plan, build, review, fix and land are steps in the same
   thread; a resume goes to the issue's existing thread (`bb thread tell`), never a new one. Lead,
   Engineer and Reviewer stay child threads under it. The Loop run is the issue thread's status, not a
   thread of its own. (Built: `staff/max/tick.js` step 4.)
2. **Max writes in one thread per day** ("Max · 2026-10-17"), each wake a new message after its model
   context is cleared. (Built.)
3. **Sidebar sections** "Max" and "Issues" until the Inbox groups them. (Built.)
4. **Approvals in both places.** The Inbox approves and rejects; Linear keeps working as well and stays
   the source of truth.
5. **Reject needs a comment.** It becomes the next round's feedback.
6. **Staff is its own menu item**, not a tab in Board: Staff are people with a charter and a memory,
   and there will be four of them.
7. **Staff's side panel lists the agents, and each agent is one standing chat with Nicklas.** Pick Max
   and you get one conversation that remembers (his memory through `bb optio brief`), not a thread per
   task. Max writes to Nicklas there too: the daily status, a question that is his, an alarm. Max's
   own work (each wake of the dispatch tick) is not in that chat: it is his activity log under him in
   the same panel, so the chat stays readable. Until the Staff page exists, the daily "Max · <date>"
   thread in the Max section is that log.

## Proposed rail (to grill)

| Item | What it holds |
| --- | --- |
| Home: **Inbox** | Everything waiting on Nicklas as cards: Approval (Approve sets Merging, Reject sends To-do with the comment), a run's `### Waiting` question with its answer, mentions, watchdog alarms. Side panel: the issue sessions grouped *Waiting on you · Running · Landing · Done today*. |
| **Board** | The orchestrator's plan: running, next, why the rest wait; milestone focus (KIT-360). |
| **Staff** | Side panel: the agents (Max, Chris, Sophie, Brad). Each one opens one standing chat with Nicklas that remembers, and under it the agent's activity log, charter, memory, runs and Heartbeat. |
| **Loops** | The registry: on/off, limits, schedule, latest runs per Loop. Settings only: a Loop's logic stays code in the repo and changes by PR. |
| **Runs** | The record of runs across Loops (KIT-365). |

## Open

- Whether a message Max writes in his chat also shows as an Inbox card (proposal: yes when it needs an answer, as with any question).
- Whether an Inbox answer to a `### Waiting` question resumes the run by itself.
- New terms for `CONTEXT.md`: Inbox, Issue session, Staff page.
- What bb's plugin SDK allows on the rail (icons, pages, a side panel per item); check before the spec.
