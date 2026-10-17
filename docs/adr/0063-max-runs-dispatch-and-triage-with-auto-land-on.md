# Max runs dispatch and triage, with auto-land on

Nicklas, 2026-10-15. Status: accepted. Changes ADR-0062 decision 1 for the time before Optio's Board is live; supersedes "Human triage only" for the `signal-up` label (`factory.config.json` label descriptions, `docs/agents/signal-up.md`); turns on ADR-0061's auto-land for the runs Max starts. Charter: `staff/max.md`. Terms: **Staff**, **Charter**, **Heartbeat** in `CONTEXT.md`.

The goal is to prove the dark factory now, not after Optio is built: no person in the normal path except writing specs and tickets. Three things still need a person today. A nameless model thread, woken by the `kit-dispatch` script, chooses what to start without a name, a memory or a charter. Every merge waits in `Approval`, because auto-land ships off. And 27 issues sit in Triage, because only a person may triage a `signal-up`.

## Decisions

1. **Max is the dispatcher until the Board is live.** The `kit-dispatch` script automation keeps watching Linear and wakes Max's thread instead of a nameless one; Max chooses and starts AFK developer runs under the same rules (eligibility, write scope, three live runs, `flow.maxRunsPerDay`). This is a model choosing what to start, which ADR-0062 rejects for the long run; it holds until KIT-360 puts the Board live, after which the Board starts runs and Max steers through priority, focus, resume and park.
2. **Runs Max starts have auto-land on.** Max passes `autoLand: true` to each AFK developer run, so `scripts/auto-land.mjs` lands a run that passes every one of its own checks (ADR-0061). `flow.autoLand.enabled` in `factory.config.json` stays `false`: a run that Max did not start still stops at `Approval`. The kill switches stay: the `hold` label, the file `.factory/auto-land.off`, and the circuit breaker.
3. **Max triages.** Every issue in Triage gets a verdict within the next tick that sees it: a clear `signal-up` is shaped into a ticket and moved to `To-do` with `ready-for-agent` (at most ten per day); a `proposal` goes to `Backlog` with Max's recommendation, because product stays Nicklas's; a duplicate or a non-issue is `Canceled` with `wontfix` and a reason; anything unclear goes to `Backlog` with `needs-info` and one question. Max never creates projects, milestones or labels.

## Consequences

- A ticket Max shaped can run and land without anyone having read it. The guards are the shaping rules, auto-land's risk class (schema, auth, IAP, workflows, factory paths and large diffs always need a person), and the daily status in which Max lists every verdict.
- The dispatch script's prompt now lives in this repo with Max's charter, not only as a stored copy inside bb.
- Max reaches Nicklas in a bb thread for now. A Linear identity of Max's own, so a mention or assignment lands in Nicklas's Linear inbox, is a later step: Linear sends no notification for actions taken with Nicklas's own API key.
- The `hold` and `no-device-needed` labels that auto-land reads must exist in Linear before the first auto-landed run.
