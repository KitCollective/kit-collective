# Worker coding slot

Feature spec on **Factory leftovers**. Domain nouns: `CONTEXT.md`. Decisions: ADR-0022 (Timeout park), ADR-0023 (Capacity gate waits). Origin finding: KIT-72. Lanes: `development` / `staging` / `production`. This is not a KitCollective product surface and not a new Seed ingest path.

KIT-72 stays related until `/to-tickets` creates the dispatchable slice; then the origin becomes Duplicate. Do not leave both dispatchable.

## Problem Statement

A hung Pi implement (hours of silence, child stuck in poll) holds the only worker mutex. The planner poller keeps enqueueing onto that same mutex every five minutes. After someone SIGTERMs the child, the worker drains planner jobs instead of factory-checker or land. `GET /health` still says `planner: active` with no running Coding job. Issue worktrees stay on the box after merge. The worker will start a new Pi spawn even when RAM or worktree-disk is gone. Nicklas cannot see who is running, cannot trust Compose probes, and cannot get checker or land through.

## Solution

The PI worker keeps **one Coding job** slot (implement / factory-checker / land). The **Planner job** runs on its own mutex — idle dispatcher, webhook or poll, no Pi spawn. A spawned Pi child with no close and no stdout for 45 minutes is **Idle timeout**: kill the process group, free the slot, write `### Review feedback`, **Timeout park**, **Worktree reap**. `GET /health` stays HTTP 200 and reports planner state, the current Coding job (or null), and **Capacity gate** numbers. Before spawn, free RAM and worktree-volume disk must clear the floors; if not, the job stays queued and the worker writes **one** Linear comment — status unchanged, not Timeout park. Land **Done**, human **Canceled**, and Timeout park remove the Issue worktree; the bare mirror stays. Parallel implement A/B/C is later.

## User Stories

1. As Nicklas, I want a hung Pi child to stop owning the box, so that factory-checker and land can run after Idle timeout.
2. As the coding slot, I want Idle timeout at 45 minutes with no close and no stdout (`PI_JOB_IDLE_MS`), so that a long quiet `pnpm test` is not killed at 15 minutes.
3. As the coding slot, I want wall-clock not to be the hang signal, so that a live Composer session that still emits stdout can run for hours.
4. As the harness, I want to kill the Pi process group on Idle timeout, so that a zombie child does not keep RAM after the mutex is free.
5. As Nicklas, I want `### Review feedback` on the existing workpad after Idle timeout, so that the hang is visible on the issue.
6. As that workpad, I want the note to name role, identifier, and idle window, so that resume is not a guess.
7. As Nicklas, I want Timeout park after that kill, so that planner does not claim the hung issue into another 15-hour loop.
8. As planner, I want never to claim Parked, so that Timeout park stays a human resume.
9. As a human, I want to unpark by moving status myself, so that retry is intentional.
10. As WORKFLOW, I want Parked to stay never auto-dispatched, so that only Timeout park adds the worker as a second Parked writer (ADR-0022).
11. As factory-checker, I want Timeout park if I hang too, so that Merging is not blocked behind a dead Grok session.
12. As land, I want Idle timeout only if I spawn Pi — I do not, so that existing `gh` timeouts remain the land hang path.
13. As the Planner job, I want my own mutex, so that skip/claim never waits on a Composer session.
14. As the planner poller, I want not to enqueue onto the coding slot, so that five-minute polls cannot pile up behind implement.
15. As a Backlog webhook, I want planner still to run while a Coding job is live, so that new ready issues can be claimed without stealing the Pi CPU.
16. As implement B, I want to wait on the one coding slot after planner claims me, so that CX33 still runs one Pi at a time.
17. As factory-checker, I want to enqueue onto the coding slot, not behind a planner backlog, so that In Review is not starved after SIGTERM.
18. As land, I want the same coding slot after Merging, so that merge permission is not stuck behind planner polls.
19. As Compose, I want `GET /health` to stay HTTP 200 while the process is up, so that a live implement is not restarted by the probe.
20. As Nicklas, I want health JSON to include `job: { role, identifier } | null`, so that I can see who occupies the slot.
21. As Nicklas, I want health JSON to keep `planner: "active"` when the poller is running, so that the Cursor cron stays paused.
22. As Nicklas, I want health JSON to include capacity (`ramFreeMb`, `diskFreeMb`, `ready`), so that “no room” is visible without SSH.
23. As Compose, I want health never to 503 because a job is running, hung, or waiting on capacity, so that Caddy does not bounce the container.
24. As the Capacity gate, I want default floors of 2 GB free RAM and 5 GB free worktree-volume disk, so that one Composer has room.
25. As ops, I want those floors in env, so that a later box size does not require a code edit to change the numbers.
26. As a Coding job, I want spawn refused when `ready` is false, so that Pi does not start on a full box.
27. As that refused job, I want to stay queued until `ready`, so that Implementing does not die waiting for a status flicker.
28. As Nicklas, I want one Linear comment when capacity is blocking, so that I know why the slot is idle.
29. As that comment, I want it updated in place on later waits, so that a 30-minute disk wait does not spam the issue.
30. As Linear, I want capacity wait not to change status, so that it is not Timeout park (ADR-0023).
31. As planner, I want to keep running during a capacity wait, so that claims are not blocked by disk.
32. As land, I want Worktree reap after a successful merge to Done, so that merged KIT-n trees do not fill `kit_pi`.
33. As a human, I want Worktree reap when I move an issue to Canceled, so that abandoned trees leave the box.
34. As Idle timeout, I want Worktree reap after Timeout park, so that a hung implement does not leave a dead KIT-n.
35. As a human who Parks mid-work, I want the Issue worktree kept, so that unpushed commits survive until I resume.
36. As checkout, I want to create the Issue worktree again after reap, so that resume from Implementing still has a cwd.
37. As the box, I want the bare mirror kept on reap, so that every issue does not re-clone GitHub.
38. As webhook, I want Done and Canceled to skip a Coding job and still reap, so that reap is not a second factory role.
39. As AgentSession, I want created/prompted still never to enqueue a Coding job, so that KIT-59 stays display-only.
40. As Scout and Gate, I want to stay inside the Implement parent, so that this slice does not add a second Pi host.
41. As KIT-71, I want implement re-enqueue still to use the one coding slot, so that CI retry waits its turn instead of a new architecture.
42. As `/tdd`, I want a fake spawn that never closes, so that Idle timeout is proven without a model.
43. As CI, I want a fake clock, so that tests do not sleep 45 minutes.
44. As tests, I want fake RAM and disk readers, so that Capacity gate is asserted without reading the GitHub runner.
45. As tests, I want a fake Linear and fake worktree remove, so that Timeout park and Worktree reap do not call hosted APIs.
46. As host docs, I want `/health` documented with job and capacity, so that `harness.eskobar.dev/health` is not the old two-field body.
47. As factory locks, I want WORKFLOW Parked wording to admit Timeout park, so that agents do not treat worker Parked as a bug.
48. As Nicklas, I want this milestone demoable on the kit-harness box after land to `development`, so that leftovers still promote as a handful.
49. As Expo / Astro / Admin SPA, I want this effort not to change collector Save, Catalog peek, or Staff access, so that product UI stays on their projects.
50. As Nest `/v1`, I want no new seed HTTP, so that ADR-0003 stays locked.
51. As Linear Agent, I want to stay empty (not Cursor), so that this work does not start a Cloud Agent.
52. As `/to-tickets`, I want new slices on this project labelled only after human triage off `signal-up`, so that KIT-72 is not double-dispatched.
53. As KIT-72, I want to become Duplicate of the new slice, so that planner sees one ticket.
54. As later work, I want N parallel implement slots left unspecified here, so that CX33 RAM is not re-litigated in this increment.

## Implementation Decisions

- **Linear:** Feature on existing project **Factory leftovers**. Lead Nicklas. Priority None. New milestone **Worker coding slot** (own staging increment). Origin KIT-72 is related until tickets exist, then Duplicate. Do not apply `ready-for-agent` to the origin `signal-up` issue.
- **Modules:** Deepen the existing worker job lifecycle (queue, Pi spawn, planner poller, HTTP health, worktree adapter, land complete). Do not add a Nest module, a product admin, or a metrics product.
- **One coding slot:** implement, factory-checker, and land share one mutex. Planner job does not enter that mutex.
- **Planner mutex:** poller and webhook `role=planner` run on that mutex only. Linear CLI skip/claim unchanged. No Pi spawn.
- **Idle timeout:** default 45 minutes (`PI_JOB_IDLE_MS`). Signal is no child `close` and no stdout. Kill the process group, free the coding slot, update the existing workpad `### Review feedback`, Timeout park (ADR-0022), Worktree reap.
- **Land:** still no Pi spawn. Existing `gh` command timeouts stay. After merge success and status Done, Worktree reap.
- **Capacity gate:** before a coding-job spawn, injected readers for free RAM and worktree-volume disk must clear env floors (defaults 2 GB RAM, 5 GB disk). Fail closed: no spawn. Job stays on the coding queue. Planner may still run. One Linear comment, updated in place, not a new comment per retry. Status unchanged (ADR-0023). Not Timeout park.
- **Worker health** body (decision shape):

  `{ ok: true, planner: "active", job: { role, identifier } | null, capacity: { ramFreeMb, diskFreeMb, ready } }`

  HTTP 200 if the process is up. Never 503 for a live, hung, or capacity-waiting job.
- **Worktree reap:** `git worktree remove` (or equivalent) plus directory delete for that identifier. Triggers: land Done, webhook/status Canceled, Timeout park. Not a human Park. Mirror stays. Checkout remains the creator.
- **Webhook:** Done and Canceled stay “no factory role” for spawn. Those status changes still call reap. HMAC, replay, AgentSession display-only, and delegate gate stay as they are.
- **Locks:** WORKFLOW / host inventory may say the worker writes Parked on Idle timeout. Do not invent Linear statuses. Do not 503 the probe.
- **Secrets:** env **names** only. No tokens in health JSON, comments, or argv.
- **Clients:** no edits to `apps/mobile`, `apps/web`, `apps/admin`, or `packages/db`.
- **Write-scope (later tickets):** harness worker, worktree, planner poller, health, host/lock prose that documents Timeout park. Not product apps.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Pi TUI internals, live Linear GraphQL, a live `pi` session, or the kit-harness box.

**Good test:** given fake spawn / clock / capacity / Linear / git, assert what a caller sees: slot free, planner ran, health JSON, Parked, one comment, reap or not. Do not mock the module graph.

**Seam (one):** the worker job lifecycle — enqueue, `/health`, spawn close/stdout, Linear workpad/status/comment, worktree checkout/reap. Callers and tests cross this interface. `/tdd` will not re-quiz it.

Adapters behind the seam (not the test surface): real `pi`, real `os.freemem` / disk stat, real Linear CLI, real `git worktree remove`. Tests inject fakes. Two adapters already exist for queue, spawn, Linear, and git in harness tests — this slice adds clock, capacity readers, and reap; it does not add a second product seam.

**Prior art:** harness compose-worker (serial queue + `/health`), planner poller enqueue, implement-adw worktree checkout, land complete, webhook skip reasons. Extend those files (or the same graph). Do not spawn a model. Do not set Linear Agent to Cursor.

Required cases at that seam:

- Fake spawn that never closes + fake clock past 45 minutes → slot free, workpad Review feedback, status Parked, worktree removed, a later factory-checker enqueue can run.
- Planner poll during a live Coding job → planner runs (or is not stuck on the coding mutex); coding slot still one-at-a-time.
- `/health` during a live job → 200, `job.role` + identifier, capacity fields; enqueue count for health is zero.
- Capacity readers below floor → no spawn, job still queued, one Linear comment, status unchanged; when readers go above floor, spawn proceeds.
- Land merge success → Done and worktree removed; human Park (not timeout) → worktree kept; Canceled → worktree removed.
- AgentSession created/prompted still does not enqueue a Coding job.

## Out of Scope

- N parallel implement sessions / extra Pi hosts (later feature).
- Prometheus, Grafana, or a metrics product.
- HTTP 503 on `/health` for a running, hung, or capacity-waiting job.
- Wall-clock as the only hang signal.
- Timeout park for a capacity wait.
- Worktree reap on a human Park.
- Deleting the bare mirror.
- KIT-71 implement CI-retry behaviour (do not break the one-slot wait).
- Re-opening Factory leftovers milestones that are already complete.
- Dispatching KIT-72 itself (`signal-up` stays until Duplicate).
- Product Expo, Astro, Admin SPA, Staff access, Take-down, Vision, Seed ingest, Nest `/v1` seed.
- Landing or promoting to `staging` / `production` from an issue run.
- Setting Linear Agent to Cursor.

## Linear

- **Project:** Factory leftovers
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Worker coding slot — Complete when the PI worker has one Coding job slot, Planner job on its own mutex, Idle timeout (45 min) → Timeout park + Worktree reap, `/health` reports job + capacity without 503, and Capacity gate waits in queue with one Linear comment. Demoable: fake never-close spawn releases the slot and Parks; planner claim runs during a live coding fake; health shows `job` and `ready`; a Done/Canceled/timeout path removes the Issue worktree; a human Park does not. Ready to promote integration → staging when that worker behaviour is on `development` and required harness tests cover the seam.

## Further Notes

- Glossary: Coding job, Planner job, Idle timeout, Timeout park, Issue worktree, Worktree reap, Capacity gate, Worker health — `CONTEXT.md`.
- ADR-0022, ADR-0023.
- Origin: [KIT-72](https://linear.app/kitcollective/issue/KIT-72/hung-pi-job-starves-the-serial-queue-planner-polls-pile-up-behind-it).
- Sibling leftovers kickoff: `.scratch/factory-leftovers/spec.md`.
- Linear document: https://linear.app/kitcollective/document/worker-coding-slot-1f5c87f92b88
- Next slash: `/to-tickets`. Do not invent issues from this skill. After tickets exist, mark KIT-72 Duplicate so planner sees one slice.
