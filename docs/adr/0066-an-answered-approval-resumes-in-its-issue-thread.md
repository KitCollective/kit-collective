# An answered Approval resumes in its Issue thread; To-do is for unstarted work

Nicklas, 2026-10-18. Status: accepted. Supersedes the line in ADR-0057 and `CONTEXT.md` that an answer moves an issue from `Approval` to `To-do` ("any answer goes back to To-do, never to a specific stage"). Terms: **Approval**, **Reserved write-scope**, **Resume order**, **Human call**, **Review finding**, **Issue thread** in `CONTEXT.md`.

From 2026-10-17 19:45 to 2026-10-18 13:45 the factory finished 22 issues with 43 run starts and 113 agent threads; 17 started issues went back to `To-do`, 16 of them by an answer. Each one waited behind new work, could lose its paths to an overlapping start (KIT-290 lost its slot to KIT-296), and began again with a new run that merged `development`, ran the gates again and made new Lead, Engineer and Reviewer threads. KIT-290 took four starts and seven threads. 99 worktrees held 11 GB on a disk with 13 GB free.

## Decision

1. **A started issue never returns to `To-do`.** `To-do` is for work that has never started.
2. **An answer resumes the issue in its Issue thread**, from `Approval` straight to `In Progress`, with `Resumed: <date>` under `### Waiting`. Until Optio's Inbox answers start it at once, Max resumes it on the next tick.
3. **A waiting issue keeps its Reserved write-scope.** It gives up its live-run slot, never its paths, so nothing overlapping starts while it waits.
4. **Resume order:** a stopped landing, then an answered `Approval`, then a stalled run, then a new start.
5. **Only a Human call stops a run in `Approval`.** What Max or the Lead can settle is settled inside the run: the Engineer stops `blocked`, the Lead replans, and the run goes on.
6. **Red reviews converge.** A Review finding names the file and line and what green looks like, and is `gating` or `nit`; the fix round answers each one; from round three the Lead replans; at most five rounds.
7. **A worktree is reaped when its issue is Done or Canceled.**

## Considered options

- Keep answers through `To-do` (one entry point for the dispatcher): simple, but it is the loop above.
- Keep a run alive while it waits for an answer: no restart, but it holds a slot and a model for hours.
- A new status for "waiting on a person": the board would gain a column for what `Approval` already means.

## Consequences

- Max's tick, the AFK developer workflow, the Board and the docs that send an answered issue to `To-do` change with this ADR; until they do, a person resumes an answered issue in its thread rather than moving it to `To-do`.
- A waiting issue can hold its paths for a long time: the Inbox shows how long, so it gets answered.
