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

## Proposed rail (to grill)

| Item | What it holds |
| --- | --- |
| Home: **Inbox** | Everything waiting on Nicklas as cards: Approval (Approve sets Merging, Reject sends To-do with the comment), a run's `### Waiting` question with its answer, mentions, watchdog alarms. Side panel: the issue sessions grouped *Waiting on you · Running · Landing · Done today*. |
| **Board** | The orchestrator's plan: running, next, why the rest wait; milestone focus (KIT-360). |
| **Staff** | Max, Chris, Sophie, Brad: charter, memory, latest runs, Heartbeat. |
| **Loops** | The registry: on/off, limits, schedule, latest runs per Loop. Settings only: a Loop's logic stays code in the repo and changes by PR. |
| **Runs** | The record of runs across Loops (KIT-365). |

## Open

- Whether an Inbox answer to a `### Waiting` question resumes the run by itself.
- New terms for `CONTEXT.md`: Inbox, Issue session, Staff page.
- What bb's plugin SDK allows on the rail (icons, pages, a side panel per item); check before the spec.
