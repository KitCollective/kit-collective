# Worker memory

Feature spec on **Factory leftovers**. Domain nouns: `CONTEXT.md` (this slice adds Worker memory, Memory writer, Memory reader, Memory policy-only). Decision: ADR-0026 (landed in the first implement PR — grill was skipped; the lock is this spec). Lanes: `development` / `staging` / `production`. This is not a KitCollective product surface and not a new Seed ingest path.

Sibling: **Harness quality and slots** (up to three Implement slots) stays its own milestone. This spec does not lift the coding slot. Worker memory is shared so later parallel Issue worktrees can read the same store without a migration.

Chosen package: `pi-hermes-memory` (policy-only default, failure memory, secret scan, WAL locks). Not `@samfp/pi-memory` (session_start dump; default consolidation is Anthropic and no-ops on Cursor/OpenRouter).

## Problem Statement

Each Pi coding job on `kit-harness` is a new session. Checker `### Review feedback`, Gate quirks, and box lessons die when the process exits. The next Issue worktree repeats the class. Cursor `MEMORIES.md` and sessionStart injection are already forbidden as a second source of truth. Error ratcheting in git is the only durable learning, and it only lands after a recurring class. Nicklas wants the worker to remember operational lessons across Issue worktrees without dumping history into Composer, without writing from Scout/Gate, and without tying the store to a worktree path that Worktree reap deletes.

## Solution

The PI worker keeps **one Worker memory** store on the `kit_pi` volume at `/var/lib/kit-pi/hermes`, outside every Issue worktree. Factory-checker is the **Memory writer** (`memory_search`, `session_search`, `memory_add`, `memory_replace`, `memory_remove`). Implement parent, Scout, Gate, and helpers are **Memory readers** (search only). Land, Auto-merge, planner, and Intake do not spawn Pi and do not touch the store. Injection is **Memory policy-only**: a short policy in the system prompt, no MEMORY.md dump, no 8 kB session_start block. Background review, correction detection, and shutdown flush run only on the Memory writer. Git ratchets, `CONTEXT.md`, and the Linear workpad still win. Recurring classes still become ratchets.

## User Stories

1. As Nicklas, I want Pi jobs on `kit-harness` to remember operational lessons across issues, so that the next implement does not rediscover an empty GitHub rollup or a token quirk from scratch.
2. As Nicklas, I want that memory on the worker volume, so that an image rebuild does not wipe it.
3. As an Issue worktree, I want Worker memory outside my tree, so that Worktree reap cannot delete the store.
4. As KIT-48 implement, I want to search what checker wrote on KIT-47, so that lessons survive a different cwd.
5. As Worker memory, I want a global store keyed independently of worktree path, so that `/var/lib/kit-pi/worktrees/KIT-n` is not a separate “project” per issue.
6. As factory-checker, I want `memory_add` / `memory_replace` / `memory_remove`, so that I can persist a class from `### Review feedback`.
7. As factory-checker, I want `memory_search` and `session_search`, so that I can avoid duplicating an existing lesson.
8. As factory-checker, I still want no `write` / `edit` / general `bash` on the repo, so that Hermes-write is not git-write.
9. As the Implement parent, I want search tools only, so that Composer cannot fill the store with in-progress guesses.
10. As Scout, I want search only (or no memory tools if the allowlist stays read/grep/find/ls), so that Hy3 recon cannot invent conventions.
11. As Gate, I want search only, so that a mechanical pre-review cannot persist “insights”.
12. As nest/expo/drizzle/ui-ux helpers, I want search only, so that parallel TDD children do not race MEMORY.md.
13. As a Memory reader, I want background review, correction detection, and shutdown flush off, so that tool-allowlist is not bypassed by a side-channel write.
14. As a Memory writer, I want those background loops allowed, so that checker can consolidate when the core cap is hit — and I prefer explicit `memory_add` from Review feedback over silent extract of the whole diff.
15. As land, I want to stay a non-Pi `gh pr merge`, so that merge does not become a Hermes writer in this increment.
16. As Auto-merge, I want no Pi spawn, so that loop-cap Merging does not touch Worker memory.
17. As planner, I want no Pi spawn, so that skip/claim never loads Hermes.
18. As Intake, I want no Pi spawn, so that Triage shaping never writes lessons.
19. As Nicklas, I want Memory policy-only, so that Composer’s prefix cache is not invalidated by an 8 kB dump every session.
20. As the Capacity gate, I want Hermes not to spawn extra `pi -p` review children on Memory readers, so that CX33 RAM floors are not spent on learning noise.
21. As `pi-hermes-memory`, I want WAL locks, so that Scout and the Implement parent can read while checker on a later job writes.
22. As parallel Issue worktrees on disk, I want one store, so that lifting coding slots later does not require a memory migration.
23. As this increment, I do not want N coding slots, so that **Harness quality and slots** stays the owner of that change.
24. As error ratcheting, I want git to remain the promotion path, so that a wrong Hermes lesson is not factory law.
25. As checker, I want a second fail of the same class still to demand a ratchet, so that Worker memory stays staging, not a hook.
26. As `CONTEXT.md`, I want product vocabulary to stay in git, so that Hermes does not become a second glossary.
27. As the workpad, I want `### Review feedback` to remain the issue-local truth, so that Hermes does not replace Linear evidence.
28. As damage-control, I want secrets still blocked from `.env` and logs, so that memory writes cannot store `CURSOR_API_KEY` or cookies.
29. As `pi-hermes-memory`, I want its secret scanner on, so that a model cannot persist tokens into MEMORY.md.
30. As Nicklas, I do not want `skill_manage` on any factory role, so that unreviewed `SKILL.md` does not sit beside `.cursor/skills/`.
31. As `.pi/settings.json`, I want `npm:pi-hermes-memory` on the required package list, so that boot fails closed if it is missing.
32. As the Dockerfile, I want `pi install npm:pi-hermes-memory` next to the other global installs, so that `pi list` on the image matches the manifest.
33. As compose, I want `/var/lib/kit-pi/hermes` on the existing `kit_pi` volume, so that we do not add a second volume without need.
34. As host.md, I want Worker memory named (path, writer/reader, policy-only), so that ops rebuilds do not assume `/root/.pi` is durable.
35. As factory-checker spawn, I want the allowlist extended with the named memory tools, so that `--no-builtin-tools` does not silently drop them.
36. As implement spawn, I want write memory tools and `skill_manage` on `--exclude-tools`, so that readers cannot call them.
37. As Scout/Gate frontmatter, I want no memory-write tools, so that Hy3 cannot persist even if the parent exclude is missed.
38. As `REQUIRED_PI_PACKAGES`, I want a 1:1 match with `.pi/settings.json`, so that existing compose-worker tests keep failing closed on drift.
39. As `check-factory-checker-spawn.mjs`, I want the new allowlist needles, so that a later PR cannot drop memory tools from checker or re-add repo write.
40. As Nicklas, I do not want `@samfp/pi-memory`, so that session_start injection and a Claude consolidation default never land on this box.
41. As Nicklas, I do not want Cursor Automations Memories, so that this slice does not reopen the `MEMORIES.md` ban.
42. As Nicklas, I do not want OpenMemory MCP on the worker, so that `.pi/mcp.json` stays empty.
43. As Desktop Cursor, I want no shared store with `kit-harness`, so that laptop sessions do not pretend to be the worker.
44. As Cloud Agents, I want no Worker memory, so that a VM without `kit_pi` cannot poison or depend on the box store.
45. As session search, I want checker and implement-parent sessions indexable, so that “what failed last time on this box” is searchable.
46. As session search, I do not want Scout/Gate child transcripts as the primary index, so that `sessions.db` does not balloon with recon dumps.
47. As core MEMORY.md, I want the package’s character cap, so that the store stays small enough to search instead of dump.
48. As consolidation, I want it only on the Memory writer, so that an implement job is not killed mid-rebase by a child consolidator.
49. As standing instructions, I want only Nicklas-authored pins (if any), so that the agent cannot promote its own notes into every prompt.
50. As `/health`, I want no memory dump and no secrets, so that Worker memory does not change the health JSON contract.
51. As the coding slot, I want still one Pi job at a time in this increment, so that Worker memory is not a reason to spawn two Composers.
52. As later parallel slots, I want readers to be cheap (search, no review children), so that extra Issue worktrees do not multiply learning LLM calls.
53. As implement, I want repo evidence to beat a Hermes hit, so that a stale lesson cannot override `CONTEXT.md` or the issue AC.
54. As Nicklas, I want env **names** only in git, so that no connection string for a sidecar memory DB appears (SQLite on volume is enough).
55. As backups, I want this increment not to turn host backups on, so that volume durability stays an ops choice, not a ticket AC.
56. As UI implement, I want Chromium still optional on the RAM floor, so that Hermes does not change Implement browser wiring.
57. As Hy3, I want Scout and Gate still pinned as today (ADR-0021), so that this slice does not retarget models.
58. As factory-checker, I want Grok still (`PI_MODEL_FAST`), so that memory tools do not imply a model change.

## Implementation Decisions

- **Linear:** Feature on existing project **Factory leftovers**. Lead Nicklas. Priority None. New milestone **Worker memory** (own staging increment). Do not attach to **Harness quality and slots**. Do not create a second Linear project.
- **ADR-0026** (same PR as the first slice): Worker memory lives on `kit_pi` at `/var/lib/kit-pi/hermes`; factory-checker is the Memory writer; other Pi jobs are Memory readers; land stays non-Pi; Memory policy-only; git ratchets remain promotion. Complements `docs/agents/error-ratcheting.md` (that file stays “not a memory store”).
- **CONTEXT.md Language** (same PR): add Worker memory, Memory writer, Memory reader, Memory policy-only with `_Avoid_` lines matching this spec. Do not put them in the generated Orchestration block.
- **Package:** `npm:pi-hermes-memory` on `REQUIRED_PI_PACKAGES` and `.pi/settings.json` (1:1). Dockerfile `pi install npm:pi-hermes-memory` with the existing global installs. Native `better-sqlite3` builds against image Node 22.
- **Store path:** `/var/lib/kit-pi/hermes` on the existing compose volume `kit_pi`. Not `/root/.pi`, not the Issue worktree, not a new named volume unless the first slice proves `HOME` must be a parent directory — then still a directory on `kit_pi`, documented in host.md.
- **Identity:** global Hermes store. Do not use project-tier memory keyed on worktree cwd.
- **Memory writer tools:** `memory_search`, `session_search`, `memory_add`, `memory_replace`, `memory_remove` added to factory-checker spawn allowlist. Repo `write` / `edit` / `bash` stay excluded. `skill_manage` stays off.
- **Memory reader tools:** implement spawn `--exclude-tools` for `memory_add`, `memory_replace`, `memory_remove`, `skill_manage`. Search tools may remain. Scout/Gate frontmatter must not list write memory tools.
- **Hermes config (committed):** Memory policy-only; `reviewEnabled` / `correctionDetection` / `flushOnShutdown` on for factory-checker sessions only, off for implement and subagents. How the worker applies per-role config is behind the spawn seam (env, copied config, or argv) — tests assert the resulting spawn/config artefacts, not the package internals.
- **Land / Auto-merge / planner / Intake:** unchanged — no Pi, no Hermes tools.
- **Modules:** deepen existing worker Pi boot and role spawn (package assert, Dockerfile install, compose volume/HOME, checker allowlist, implement exclude-tools, host.md). Do not add a Nest module, product admin, or MCP server on the worker.
- **Locks:** error-ratcheting ban on `MEMORIES.md` / sessionStart dump stays. Worker memory is policy-only search, not that dump. Empty `.pi/mcp.json` stays.
- **Secrets:** no tokens in MEMORY.md, health, argv, or comments. Package secret scan on.
- **Clients:** no edits to `apps/mobile`, `apps/web`, `apps/admin`, `packages/db`, or Seed ingest.
- **Write-scope (later tickets):** `harness/**`, `.pi/**`, `docs/adr/0026-*.md`, `CONTEXT.md` Language, `docs/agents/error-ratcheting.md` only if a pointer sentence is required, `scripts/check-factory-checker-spawn.mjs` (and its test) when the allowlist changes. Not product apps.
- **Capacity gate / Idle timeout / coding slot:** unchanged (ADR-0022, ADR-0023). Hermes must not start review children on Memory readers.

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert `pi-hermes-memory` SQLite internals, live `pi` TUI, a live model, or the kit-harness box.

**Good test:** given repo files + fake `pi list` / captured spawn argv / Dockerfile + compose text, assert: package is required and installed in the image recipe, checker argv includes search+write memory tools and still excludes repo write, implement argv excludes memory-write tools, hermes data dir is on `kit_pi` not the worktree, reader config has review/flush off. Do not mock the module graph. Do not open a real `sessions.db`.

**Seam (one):** worker Pi package boot and role spawn — the same public interface as `assertPiPackagesReady` / `REQUIRED_PI_PACKAGES`, `factoryCheckerPiArgs`, implement `runPiJob` argv, compose + Dockerfile, and `check-factory-checker-spawn.mjs`. Callers and tests cross this interface. `/tdd` will not re-quiz it.

Adapters behind the seam (not the test surface): real `pi`, real Hermes SQLite, real volume on kit-harness. Tests inject fakes or read committed files. Two adapters already exist (fake `listPackages`, captured `spawnProcess`) — this slice extends them; it does not add a second product seam.

**Prior art:** `harness/tests/compose-worker.test.mjs` (settings ↔ `REQUIRED_PI_PACKAGES`, Dockerfile `pi install`), `harness/tests/checker.test.mjs` (allowlist / `--no-builtin-tools`), `scripts/check-factory-checker-spawn.mjs` + `pnpm check:factory-checker-spawn`, implement-adw spawn argv. Extend those files (or the same graph). Do not spawn a model. Do not set Linear Agent to Cursor.

Required cases at that seam:

- `.pi/settings.json` lists `npm:pi-hermes-memory` and equals `REQUIRED_PI_PACKAGES`; boot `assertPiPackagesReady` fails closed when `pi list` omits it.
- Dockerfile `pi install npm:pi-hermes-memory` (global, with the other packages).
- Compose/`host.md`: Worker memory path is under `/var/lib/kit-pi/` (hermes directory), not the Issue worktree path pattern `worktrees/KIT-`.
- Factory-checker spawn argv includes `memory_search`, `session_search`, `memory_add`, `memory_replace`, `memory_remove`; still `--no-builtin-tools` and excludes `write`, `edit`, `bash`; still has `linear_cli`.
- Implement spawn argv excludes `memory_add`, `memory_replace`, `memory_remove`, `skill_manage`.
- Scout and Gate agent files do not advertise memory-write tools.
- Committed Hermes config (or spawn env) shows policy-only and review/flush off for implement; checker is the writer.
- `check-factory-checker-spawn.mjs` fails if checker loses memory-write tools or regains repo `write`.
- Land / auto-merge still do not spawn Pi (existing tests stay green).
- Worktree reap tests still remove `worktrees/KIT-n` and do not mention deleting `/var/lib/kit-pi/hermes`.

## Out of Scope

- `@samfp/pi-memory`, `pi-total-recall`, Cursor Automations `MEMORIES.md`, OpenMemory MCP on the worker.
- Lifting the coding slot / three Implement slots (**Harness quality and slots**).
- Making land or Auto-merge a Pi / Hermes writer.
- `skill_manage` and agent-authored standing pins.
- Project-tier Hermes memory keyed on Issue worktree cwd.
- Dumping MEMORY.md or 8 kB of lessons into the implement system prompt (legacy-inject / `@samfp` session_start).
- Sharing the store with Desktop Cursor or Cloud Agents.
- Product Expo, Astro, Admin SPA, Nest `/v1`, Seed ingest, `packages/db`.
- Turning on Hetzner host backups.
- Prometheus/Grafana.
- Changing Capacity gate floors, Idle timeout, or `/health` JSON.
- Replacing error ratcheting with Hermes.
- Landing or promoting to `staging` / `production` from an issue run.
- Setting Linear Agent to Cursor.

## Linear

- **Project:** Factory leftovers
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Worker memory — Complete when `pi-hermes-memory` is a required worker package, the store lives on `kit_pi` at `/var/lib/kit-pi/hermes` (survives image rebuild and Worktree reap), factory-checker is the Memory writer, implement/Scout/Gate/helpers are Memory readers (no side-channel review writes), injection is Memory policy-only, land still does not spawn Pi, ADR-0026 + CONTEXT.md nouns exist, and harness tests cover the spawn/boot seam. Demoable: compose-worker/checker tests show the package and argv split; a fake worktree reap does not delete the hermes path; `pi list` recipe includes the package. Ready to promote integration → staging when that worker behaviour is on `development`.

## Further Notes

- Glossary to add: Worker memory, Memory writer, Memory reader, Memory policy-only — `CONTEXT.md` Language.
- ADR-0026 in the first implement PR.
- Sibling leftovers kickoff: `.scratch/factory-leftovers/spec.md`. Sibling slot work: `.scratch/worker-coding-slot/spec.md`. Do not reopen completed Factory leftovers milestones.
- Primary sources for the package: [pi-hermes-memory](https://github.com/chandra447/pi-hermes-memory) (policy-only, WAL, secret scan); rejected [ @samfp/pi-memory](https://pi.dev/packages/@samfp/pi-memory).
- Linear document: https://linear.app/kitcollective/document/worker-memory-afd972bf378c
- Tickets: [KIT-111](https://linear.app/kitcollective/issue/KIT-111/persist-worker-memory-on-kit-pi) (unblocked), [KIT-112](https://linear.app/kitcollective/issue/KIT-112/factory-checker-is-the-memory-writer) (blockedBy KIT-111).
- Next: planner claims KIT-111 (`Backlog` + `ready-for-agent` + unblocked). Do not set Linear Agent to Cursor.
