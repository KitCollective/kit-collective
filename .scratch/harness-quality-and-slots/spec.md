# Harness quality and slots

Feature spec on **Factory leftovers**. Domain nouns: `CONTEXT.md`. Decisions: ADR-0027 (Ratchet nudge is `reviewLoops`), ADR-0029 (three Implement slots + one Finisher). ADR-0026 is Worker memory (already on `development`). Prior increment: Worker coding slot (one slot), Intake and auto-merge. Lanes: factory produces on `development`. Staging and production stay a later human Cursor promotion.

This is not a KitCollective product surface and not a new Seed ingest path.

## Problem Statement

The factory loop is closed, but the worker still runs one Coding job at a time. Planner claims every eligible issue; implement B waits behind A, and factory-checker waits behind both. `/health` shows a singular `job`, not who is waiting. Implement can flip In Review with files outside `write-scope:`. The second checker-fail of the same issue does not mechanically require a ratchet — planner has no Pi to judge “class”. Nicklas cannot see the Coding queue, cannot run three non-overlapping slices on the same kit-harness process, and cannot trust that a sloppy PR is stopped before checker.

## Solution

The same Compose process grows a pool: **up to three Implement slots** plus **one reserved Finisher slot**. Planner stays on its own mutex and never occupies a slot. Capacity gate still applies **per Pi spawn**. `/health` reports `jobs` (running) and `queued` (waiting). **Write-scope exit** keeps an out-of-glob PR in Implementing. **Ratchet nudge** fires when `reviewLoops >= 2`. Nicklas resizes kit-harness (CX43) so three Composer sessions can actually clear the RAM floor; the worker does not invent a second host or Compose replicas.

## User Stories

1. As Nicklas, I want up to three Implement slots on the same kit-harness process, so that non-overlapping slices can code at the same time.
2. As an Implement slot, I want my own Issue worktree, so that KIT-n does not share a cwd with KIT-m.
3. As planner, I want to keep claiming without a concurrency cap, so that eligible issues become Implementing even when all three slots are full.
4. As planner, I want to skip a candidate whose `write-scope:` overlaps an Implementing issue, so that two Composers do not fight the same paths.
5. As planner, I want my own mutex, so that claim, Intake, and resume never wait on Composer.
6. As planner, I want never to occupy an Implement slot or the Finisher slot, so that dispatch stays Linear CLI.
7. As implement B, I want to run while implement A is live when a slot is free and Capacity gate is ready, so that I am not stuck behind A’s Gate wait.
8. As implement C, I want the same when two slots are already live, so that the cap is three, not two.
9. As implement D, I want to wait on the Coding queue when three implements are live, so that I never become a fourth Composer.
10. As the Finisher slot, I want factory-checker, Auto-merge, and land only, so that In Review and Merging are not stuck behind three Composer jobs.
11. As a factory-checker, I want to jump queued implement, so that a finished PR is judged while another slice still codes.
12. As the Finisher slot, I want never to run implement, so that a reserved slot cannot become a fourth coder.
13. As a live Composer, I want Finisher not to kill me when checker arrives, so that jump means queue order, not SIGTERM.
14. As Auto-merge, I want the Finisher slot (no Pi), so that Ready for merge → Merging does not wait on an Implement slot.
15. As land, I want the same Finisher slot, so that merge to `development` is not behind Composer.
16. As Capacity gate, I want a check before each Pi spawn, so that slot count is not a promise of free RAM.
17. As implement 2 on CX33, I want to stay queued when the RAM floor fails, so that the box does not OOM.
18. As Nicklas, I want to resize kit-harness to CX43 in this increment, so that three Composer sessions can clear the floor.
19. As host docs, I want that resize named on kit-harness, so that agents do not treat 8 GB as enough for three live implements.
20. As Worker health, I want `jobs` as the running Implement and Finisher occupants, so that I can see who holds slots.
21. As Worker health, I want `queued` as KIT identifiers waiting, so that I can see whether slots are the bottleneck.
22. As Worker health, I want HTTP 200 while jobs run, hang, or wait on capacity, so that Caddy does not bounce Compose.
23. As `/health`, I want no API keys and no invented token counts, so that the probe stays public.
24. As Compose, I want a singular `job` field gone as the occupancy signal, so that agents read `jobs`.
25. As Write-scope exit, I want the PR diff checked against the issue `write-scope:` globs after implement Pi exits, so that In Review is not the first gate.
26. As Write-scope exit, I want a miss to stay Implementing with `### Review feedback` listing the paths, so that the next implement pass fixes the class.
27. As an issue with no `write-scope:` line, I want that check skipped, so that unset scope still means “planner does not skip overlap”.
28. As a required ratchet, I want exception paths in-scope, so that a hook or check script is not a write-scope miss.
29. As implement-exit, I want to reuse the existing write-scope matcher, so that CI and the worker do not disagree.
30. As GitHub CI, I want `check-pr-write-scope` to keep failing out-of-glob PRs, so that the worker gate is not the only check.
31. As Ratchet nudge, I want a workpad line when `reviewLoops >= 2`, so that the next implement must land a ratchet.
32. As checker-exit, I want to write that nudge when I increment `reviewLoops` across 2, so that the signal is mechanical.
33. As planner, I want to repeat the nudge on Implementing when I see `reviewLoops >= 2`, so that a cold implement job still sees it.
34. As planner, I want no Pi and no NLP “same class”, so that CLI can do this.
35. As Loop cap, I want to stay at five, so that a nudge at 2 is not merge-block.
36. As `ciFailCycles`, I want not to trigger Ratchet nudge, so that flaky required checks are not a hook demand.
37. As Idle timeout, I want to free only the hung child’s slot, so that siblings on the same worker keep running.
38. As Timeout park, I want Worktree reap for that identifier only, so that a hang on KIT-n does not reap KIT-m.
39. As AgentSession, I want created/prompted still display-only, so that the prompt box does not enqueue a slot.
40. As `.pi/mcp.json`, I want to stay empty, so that Coolify, Seed, and Desktop plugins do not land on the worker.
41. As kit-harness, I want no `DATABASE_URL`, so that a Composer cannot DROP development Postgres.
42. As Expo / Astro / Admin SPA, I want this increment not to change collector Save or Staff access, so that product UI stays on their projects.
43. As Nest `/v1`, I want no new seed HTTP, so that ADR-0003 stays locked.
44. As `/tdd`, I want fakes at the existing worker seam, so that CI never spawns Pi or resizes Hetzner.
45. As `/to-tickets`, I want slices on this milestone after this spec, so that we do not invent issues here.

## Implementation Decisions

- **Linear:** Feature on existing project **Factory leftovers**. Lead Nicklas. Priority None. New milestone **Harness quality and slots** (own increment; factory still produces on `development`). Do not create a second project.
- **Modules:** Deepen the existing worker job lifecycle (slot pool, `/health` body, implement-exit, checker-exit, planner Linear comments, host inventory). Do not add a Nest module or a metrics product.
- **Seam (one):** the worker job lifecycle — enqueue onto Implement vs Finisher vs planner mutex, `/health`, Pi spawn/close/stdout, Linear workpad/status/comment, worktree checkout/reap, implement-exit gates, checker-exit verdict. Callers and tests cross this interface. No second product seam.
- **Implement pool:** cap 3 concurrent implement jobs (`PI_IMPLEMENT_SLOTS`, default 3, clamp 1–3). Each checkout is `/var/lib/kit-pi/worktrees/KIT-n`.
- **Finisher slot:** exactly one. Roles: factory-checker, auto-merge, land. Priority over queued implement. Never implement. Does not SIGTERM a live Implement slot.
- **Planner mutex:** planner, Intake, resume only. Unchanged. No Pi.
- **Capacity gate:** evaluate before each Pi spawn (implement and factory-checker). Fail closed: that job stays on the Coding queue; one Linear comment updated in place; status unchanged (ADR-0023). Slot count does not waive the floor.
- **Worker health** body:

  `{ ok: true, planner: "active", jobs: [{ role, identifier }], queued: ["KIT-n"], capacity: { ramFreeMb, diskFreeMb, ready }, tokens }`

  `jobs` is running occupants (empty array when idle). `queued` is waiting identifiers, not a row in `jobs`. HTTP 200 while the process is up.
- **Write-scope exit:** after implement Pi exits, diff the open issue PR (or worktree vs `origin/development`) against `write-scope:` globs using the existing write-scope matcher and ratchet exception. Miss → stay Implementing, `### Review feedback` lists paths, do not move In Review. Unset globs → skip.
- **Ratchet nudge:** when checker-exit increments `reviewLoops` to 2 or higher, append one workpad line that the next implement must land a ratchet (`docs/agents/error-ratcheting.md`). Planner, on its poll, comments the same if status is Implementing and `reviewLoops >= 2` and the line is missing. No model. Loop cap remains 5. `ciFailCycles` does not nudge.
- **Host:** Nicklas resizes kit-harness CX33 → CX43 in this increment. `harness/host.md` records the SKU. Worker code does not call Hetzner.
- **Locks:** CONTEXT terms Implement slot, Finisher slot, Coding queue, Write-scope exit, Ratchet nudge, Worker health. ADR-0027, ADR-0029. Empty `.pi/mcp.json`. No `DATABASE_URL` on the worker.
- **Secrets:** env **names** only. `PI_IMPLEMENT_SLOTS` is a count, not a token.
- **Clients:** no edits to `apps/mobile`, `apps/web`, `apps/admin`, or `packages/db`.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Pi TUI internals, live Linear GraphQL, a live `pi` session, Hetzner resize, or Chromium.

**Good test:** given fake spawn / clock / capacity / Linear / git / `gh`, assert occupancy, health JSON, status, workpad lines, skipped claims. Do not mock the module graph.

**Seam (one):** the worker job lifecycle named above. `/tdd` will not re-quiz it.

Adapters behind the seam (not the test surface): real `pi`, real `os.freemem` / disk stat, real Linear CLI, real `git`, real Hetzner. Tests inject fakes. The queue, spawn, Linear, git, and `gh` adapters already exist in harness tests.

**Prior art:** `harness/tests` for compose-worker health, job-queue, planner write-scope overlap, implement-exit, checker-exit, idle-timeout, resume queued identifiers. Extend those files. Do not spawn a model. Do not set Linear Agent to Cursor.

Required cases at that seam:

- Three fake implement jobs with distinct write-scopes and ready capacity → three running occupants in `jobs`; a fourth waits in `queued`.
- Three live implements + factory-checker enqueue → checker runs on the Finisher slot; implements stay up.
- Finisher busy + another checker → second waits in `queued`, not on an Implement slot.
- Implement enqueue while Finisher is free and implement pool is full → implement stays queued; Finisher is not stolen.
- Planner enqueue during three live implements → planner runs; no extra Pi.
- Capacity below floor on the second spawn → first implement stays in `jobs`; second in `queued`; one capacity comment; status Implementing.
- `/health` → 200, `jobs` array, `queued` array, capacity, no singular occupancy-only `job` as the SoT.
- Implement-exit with files outside `write-scope:` → Implementing, Review feedback names paths, not In Review.
- Implement-exit with only in-glob + ratchet-exception paths → existing pre-review path may still move In Review when gates pass.
- Issue without `write-scope:` → exit does not fail on paths.
- Checker-exit incrementing `reviewLoops` from 1 to 2 → workpad contains the ratchet nudge; status Implementing.
- `reviewLoops: 5` still blocks Auto-merge (existing Loop cap).
- Planner poll sees Implementing + `reviewLoops >= 2` without the nudge line → one comment; no status move.
- AgentSession created/prompted still does not enqueue.
- Idle timeout on one implement → that slot frees and Parks; a sibling implement is not killed.

## Out of Scope

- Compose replicas, a second harness host, or Linear Agent → Cursor.
- A fourth Implement slot or using the Finisher slot for implement.
- Product MCP on the worker (Coolify, `kc_seed_mcp`, AgentMail, Notion, Stripe).
- `DATABASE_URL` on kit-harness.
- NLP “same class” for Ratchet nudge.
- New Chromium / computer-use work (Implement browser stays as it is).
- Staging or production promotion from land.
- Prometheus, Grafana, or a metrics product.
- Changing Intake promote rules, Auto-merge loop-cap numbers, or missing Linear Type skip.
- Product Expo, Astro, Admin SPA, Seed ingest, Nest `/v1` seed.
- Inventing Linear issues from this skill.

## Linear

- **Project:** Factory leftovers
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one increment the factory can demo on `development`):
  1. Harness quality and slots — Complete when the worker can run up to three Implement slots plus one Finisher slot on one process, `/health` shows `jobs` and `queued`, Write-scope exit keeps an out-of-glob PR in Implementing, Ratchet nudge writes at `reviewLoops >= 2`, planner stays on its own mutex, Capacity gate still waits per spawn, and host.md names the CX43 resize. Demoable: fakes show three implements + a jumping checker; a fourth waits; an out-of-glob diff does not flip In Review; a second review loop writes the nudge. Ready to promote later when Nicklas wants — land still only merges to `development`.

## Further Notes

- Glossary: Implement slot, Finisher slot, Coding queue, Write-scope exit, Ratchet nudge, Worker health, Capacity gate, Planner job — `CONTEXT.md`.
- ADR-0027, ADR-0029. Sibling: Worker coding slot (Done), Intake and auto-merge (Done). Worker memory is ADR-0026.
- Linear document: https://linear.app/kitcollective/document/harness-quality-and-slots-487863272138
- Next slash: `/to-tickets`. Do not invent issues from this skill.
