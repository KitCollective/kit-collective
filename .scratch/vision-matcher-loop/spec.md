# Vision Matcher loop — label, eval, improve

Feature spec for the KitCollective Linear project, milestone **Vision Matcher loop**. Domain nouns: `CONTEXT.md` (Vision label, Vision eval, Vision improve, Vision Matcher, Vision suggestion, Save, CatalogLabel, UserJersey, Kit). Decisions: ADR-0044 (OpenRouter Google-pin), ADR-0046 (loop learns Nest artifacts, not Gemini weights), ADR-0019 (Admin English chrome). Architecture: `.scratch/Architecture/tech-stack.md` §6. Design lock: `docs/design-system.md` Admin User Data (hairline Data table, entity Chips, waffle Master Data | User Data — no third place, no new Confirm chrome).

This spec **does not** replace Vision Matcher inference, the jersey cap, grouping, or Football Data Seed ingest. It **extends** identity Save so guess versus Gem becomes a Vision label, Nest scores it, and Staff-gated improve proposals sit in Admin.

Throwaway prototypes and the CLIP/Voyage letter are not the contract.

## Problem Statement

Vision Matcher already logs a guess and `user_action` at Save, but Staff cannot see the påståede kendetegn versus what the collector Gem’ed, and nothing feeds CatalogLabel, prompt, or seed. Agents will either pretend Gemini trains on OpenRouter logs, stand up CLIP/pgvector on the collector path, or leave `vision_log` as an unread archive. Collectors keep correcting the same club hint; the mapper never learns.

## Solution

At **Gem**, Nest writes a **Vision label** on the identity job: suggested versus selected Club xor NationalTeam, season, type, catalogKitId, player, and patch, plus UserJerseyPhoto pointers (bytes stay in lane R2). Nest scores it immediately (**Vision eval**: per-field hit, existing `user_action`, class `accepted` | `alias` | `coverage` | `model` | `transport`). Staff lists labels and **Vision improve** rows in User Data (English Data table). Alias proposals can be applied (CatalogLabel upsert). Seed and prompt proposals are noted, never auto-run. Save still does not wait. Gemini is unchanged. Grouping labels wait.

## User Stories

1. As a signed-in collector, I want Gem unchanged (still never waits on Vision), so that the loop is not a Save gate.
2. As a signed-in collector, I want Confirm chrome unchanged, so that I do not see eval classes or improve queues.
3. As a signed-in collector who Gem’s with an identity job, I want Nest to snapshot suggested versus selected identity fields on that job, so that later Samling edits cannot rewrite the label.
4. As a signed-in collector, I want that snapshot to include Club xor NationalTeam, season, type, catalogKitId, player, and patch, so that kit and nameset corrections count.
5. As a signed-in collector, I want `user_action` to stay accepted / edited / ignored from the existing Save resolver (side, season, type), so that KIT-27 does not reopen.
6. As a signed-in collector whose identity job was pending, failed, or noop at Gem, I want the label class `transport`, so that key/timeout misses are not scored as model errors.
7. As a signed-in collector who Gem’s without any identity job, I want no Vision label, so that a picker-only Save is not fake eval.
8. As a signed-in collector, I want the job that Save attached (`visionJobId` or server enqueue) to be the labelled job, so that retries on the same draft do not invent a second facit.
9. As a signed-in collector on first-session who then registers and Gem’s, I want the identity job document that Confirm used to receive the label, so that unsigned and signed Saves are one contract.
10. As Nest Collection, I want to persist selected field UUIDs and enums on the Vision log row at reconcile, so that join-to-live-UserJersey is not the label.
11. As Nest Vision eval, I want a per-field hit map on that row, so that Staff can see season missed while club hit.
12. As Nest Vision eval, I want overall class `accepted` when every identity field hits, so that hit-rate has a denominator.
13. As Nest Vision eval, I want overall class `transport` when job status is pending, failed, or noop, so that transport is not mixed into model.
14. As Nest Vision eval, I want overall class `model` when a suggested catalog UUID or type is set and differs from selected, so that a wrong lock is the serious miss.
15. As Nest Vision eval, I want overall class `alias` when a hint string compact-matches the selected entity’s CatalogLabel or existing alias but the suggested UUID was empty or wrong, so that FCK-style misses become CatalogLabel work.
16. As Nest Vision eval, I want overall class `coverage` when the suggestion is empty, the collector filled the field, and the job had catalogMiss or zero mapper kit hits, so that seed holes are not blamed on Gemini.
17. As Nest Vision eval, I want class priority transport > model > alias > coverage > accepted when several fields disagree, so that Admin filters have one class per row.
18. As Nest Vision eval, I want optional player and patch empty/empty to count as a field hit, so that omitted pads are not coverage.
19. As Nest Vision eval, I want a hallucinated patch UUID that the collector left empty to count as a field miss class `model`, so that invented pads are visible.
20. As Nest, I want no second Gemini call at Save to classify, so that eval stays deterministic and cheap.
21. As Nest, I want UserJerseyPhoto object keys (not bytes) on the label, so that a later fine-tune increment can find the photos without a training bucket now.
22. As Nest, I want vision_raw still never logged to stdout or Admin as photo payloads, so that collector cellar photos do not leak in the table.
23. As Staff, I want a User Data chip **Vision labels** beside Users / Jerseys / Auth events, so that I do not invent a third waffle place.
24. As Staff, I want that table to reuse the hairline Data table (pagination, English chrome, light only), so that agents do not invent a dashboard primitive.
25. As Staff, I want each label row to show class, user_action, suggested versus selected labels (not only UUIDs), latency, and model, so that I can see the påståede kendetegn.
26. As Staff, I want filters for class and user_action, so that I can list only alias or only model.
27. As Staff, I want 401 without a session and 403 without Staff access, so that collectors cannot read eval.
28. As Staff, I want no Danish stems in Admin chrome for this table, so that ADR-0019 holds.
29. As Staff, I want a User Data chip **Vision improve** for proposal rows, so that the queue is not a chat paste.
30. As Nest, I want to upsert a Vision improve proposal at Save when class is alias or coverage, fingerprinting kind + entity + text, so that the same FCK miss increments count instead of duplicating rows.
31. As Nest, I want a model-class Save to upsert a prompt-kind proposal with field name and suggested versus selected ids (no generated prose), so that prompt work has a queue without a second VLM.
32. As Nest, I want accepted and transport Saves not to create improve proposals, so that the queue stays actionable.
33. As Staff, I want proposal status `proposed` | `applied` | `dismissed`, so that the queue has a lifecycle.
34. As Staff, I want Apply on an alias proposal to upsert CatalogLabel kind alias on the selected Club or NationalTeam (locale `da` if the hint is Danish-shaped, else `en`), so that the next identity map can hit.
35. As Staff, I want Apply on an alias that already exists to mark the proposal applied without duplicating the label, so that double-apply is idle.
36. As Staff, I want Dismiss to set dismissed without writing stamdata, so that a bad collector Gem cannot poison the catalog through me either.
37. As Staff, I want Apply on seed or prompt proposals to be rejected or to mean “noted” (`applied` without writing Kit rows or prompt files), so that Admin cannot silently mutate seed or git.
38. As a factory eval-agent, I want GET lists of labels and proposals on `/v1/admin`, so that I aggregate without importing packages/db.
39. As a factory eval-agent, I want those lists to omit photo bytes and Authorization values, so that a report cannot leak cellar dumps.
40. As Nicklas, I want a staging demo: Gem a UserJersey where identity suggested the wrong or missing club hint that I correct; User Data shows the Vision label with class alias or model; Vision improve shows one proposed row that is still not applied, so that the milestone can promote without Auto-merge of stamdata.
41. As Nicklas, I want Apply on that alias proposal then a second identity on a similar photo to lock the club, so that improve is real, not theatre.
42. As Staff, I want Take-down of a UserJersey not to require deleting improve proposals, so that aggregated fingerprints survive a takedown.
43. As Nest, I want take-down to keep deleting vision_log as today; label columns live on that row, so that KIT-27 cleanup does not orphan a second table of photos.
44. As a collector, I want size, condition, notes, and Photo roles out of the Vision label, so that chips I always pick by hand are not scored as Matcher misses.
45. As Nest Vision, I want grouping jobs to remain unlabelled this increment, so that bind-versus-guess is not faked from Save.
46. As Nest Vision, I want grouping still not to increment the Vision Matcher cap, so that Plus math does not change.
47. As a collector, I want Gem to stay 200 if the Vision label write fails after the UserJersey commit, so that eval bookkeeping cannot roll back a successful Save.
48. As Nest, I want the label write to run only after that commit, so that a label never exists without a saved copy.
49. As Staff, I want hit-rate counts (accepted / labelled identity Saves in the window) on the Vision labels table caption or a summary line, so that eval is not only a row dump.
50. As an implementing agent, I want to flag a design-lock gap if User Data chips cannot add Vision labels / Vision improve without a third waffle tile, so that I do not invent a Master Data top tab for collector eval.
51. As a client app, I want Admin to import only packages/api-contract and packages/domain, so that Vite never imports packages/db or apps/api.
52. As Expo, I want zero new fields on Collection Save request beyond the existing visionJobId path, so that the collector client does not learn eval classes.
53. As Nest, I want selected fields taken from the Save body that just committed, so that the client cannot send a fake facit.
54. As Staff, I want English empty states on both new tables, so that a lane with no Saves is not a blank canvas.
55. As Staff, I want reduced-motion and hit targets ≥ 44 on Apply / Dismiss, so that the Admin a11y floor holds.
56. As Nest, I want OpenRouter / Gemini prompts, pins, and worker concurrency unchanged, so that this increment is the loop, not a model swap.
57. As a hundred collectors who POST identity at once, I want those jobs on the existing BullMQ `vision` queue (worker concurrency 8, Redis per lane when `REDIS_URL` is set), so that Gemini is not stampeded and Confirm still fail-opens.
58. As those same collectors when they Gem, I want Vision label and improve upsert to be Postgres after commit — not a second BullMQ job and not another Vision call — so that 100 Saves are 100 small writes, not 100 extra inferences.
59. As Nest, I want 100 identical alias corrections to increment one improve fingerprint `count`, so that the queue does not grow a row per collector.
60. As Nest without Redis (tests / local smoke), I want the existing in-process `setImmediate` Vision enqueue to stay, so that this increment does not require Redis to Save.
61. As Nest, I want Eve, pgvector, CLIP, Voyage, Jina, and Vertex tuning jobs forbidden on this path, so that ADR-0046 holds.
62. As Football Data Seed, I want coverage proposals to name club/season/kit ids only, so that ingest stays seed_join, not Nest scrape.
63. As Staff, I want not to PATCH identity-vision-prompt from Admin, so that prompt improve stays a factory ticket after the queue flags it.
64. As a collector with a private UserJersey, I want Staff still able to see the label (User Data already sees private copies), so that eval is not blinded by Privat.
65. As Nest, I want unsigned IP-cap 429s to create no Vision label, so that throttled first-session is not eval noise.
66. As Nest, I want failed identity that later Gem’s to class transport even if the collector filled every picker, so that noop keys are not coverage.

## Implementation Decisions

- **Linear:** Feature on existing project KitCollective v1. New milestone **Vision Matcher loop**. No second project. Grouping-eval and Vertex fine-tune are later features, not this milestone.
- **Visual lock:** Reuse Admin User Data Chips + hairline Data table. English: **Vision labels**, **Vision improve**. Apply / Dismiss as existing Button density. No Confirm change. No `/to-design` unless adding those chips is rejected by the lock (then flag; do not invent a waffle place).
- **Modules:** **Collection** Save commits UserJersey then asks **Vision** to write the Vision label and eval class on the identity `vision_log` row (extend reconcile). **Vision** owns classification and improve-proposal upsert. **Admin** lists labels and proposals; Apply alias upserts CatalogLabel. **Catalog** mapper unchanged except it will start hitting new aliases after Apply. Expo Collection Save contract unchanged.
- **Seam (one):** `packages/api-contract` `/v1` as implemented by Nest (Fastify). Callers and tests cross this interface. Collection Save, Admin list labels, Admin list/apply/dismiss improve are resources on this seam. Factory eval-agent is a Staff-authenticated caller, not a second public interface.
- **Label storage:** Selected identity fields, per-field hit map, eval class, and photo key pointers live on the identity `vision_log` row. Do not join live `user_jersey` as facit. Do not store JPEG bytes on the log.
- **user_action:** Keep `resolveVisionSaveAction` semantics (side, season, type only). Eval class and per-field map are additional columns, not a rewrite of the enum.
- **Eval class (deterministic, no VLM):**
  1. Job `pending` | `failed` | `noop` → `transport`.
  2. Else if any identity field has a non-empty suggestion that differs from selected → `model`.
  3. Else if a hint string compact-matches selected CatalogLabel/alias (same fold as kit-lock) and the suggested UUID for that entity was empty or different → `alias`.
  4. Else if a required identity field (side, season, type, catalogKitId) is selected, suggestion empty, and the job had catalogMiss or zero kit hits → `coverage`.
  5. Else → `accepted`.
- **Improve rows:** Own table, fingerprint unique (kind + entity type/id + text). `count` increments on repeat Saves. Status `proposed` | `applied` | `dismissed`. Kinds: `alias` | `seed` | `prompt`. Alias Apply writes CatalogLabel. Seed/prompt Apply is noted only (`applied`, no Kit insert, no git write).
- **Save fail-open:** UserJersey commit is the product Save. Label/proposal write runs after commit; on failure log and leave Save 200. Missing labels are a signal-up class, not a collector error.
- **Take-down:** Existing vision_log delete on jersey delete. Improve proposals are not jersey-scoped; they stay.
- **Clients:** `apps/admin` and `apps/mobile` import only `packages/api-contract` and `packages/domain`.
- **Jobs (already locked, this increment does not add a queue):** Identity and grouping inference stay on BullMQ queue `vision` in the same Nest process (tech-stack §9). Worker concurrency **8**. Redis is the broker per lane when `REDIS_URL` is set (`maxmemory-policy noeviction`); unset → in-process `setImmediate` as today. Save never awaits that worker. **Vision label / eval / improve are not BullMQ jobs** — they are Postgres writes after UserJersey commit. A hundred concurrent Gems must not enqueue a hundred extra Gemini calls. A hundred identical alias misses increment one proposal `count`. Do not add a second worker container or an eval queue.
- **Glossary:** `CONTEXT.md` Vision label / Vision eval / Vision improve. ADR-0046.

Admin list (shape, not a committed schema file):

```text
VisionLabelRow {
  jobId, createdAt, class, userAction,
  suggested: { clubId?, nationalTeamId?, seasonId?, type?, catalogKitId?, playerId?, patchId?, labels... },
  selected:  { clubId?, nationalTeamId?, seasonId?, type, catalogKitId?, playerId?, patchId?, labels... },
  fieldHits: { side, season, type, catalogKitId, player, patch },
  latencyMs?, model?, photoKeys: string[]
}

VisionImproveRow {
  id, kind: alias|seed|prompt, status, count, fingerprint,
  text?, entityType?, entityId?, field?, createdAt, updatedAt
}
```

## Testing Decisions

Tests cover external behaviour at the highest public interface. They do not assert Drizzle column names, Gemini payloads, or Admin CSS.

**Good test:** HTTP (contract parse + Nest) with a signed-in Collector, fixture catalog, fake Vision adapter. Identity suggest returns ready club A; Save with club B (alias-shaped hint matching B’s label) is 200; GET Admin Vision labels as Staff shows one row class `alias`, selected club B, suggested empty or A; Vision improve lists a proposed alias for B; Apply upserts CatalogLabel; a second identity with the same hint maps to B. Save with status noop is class `transport` and creates no improve row. Save with catalogMiss and collector-picked club is `coverage`. Save where suggested club UUID ≠ selected and hint does not match selected labels is `model`. Save that matches all identity fields is `accepted`. A later PATCH UserJersey club does not change the label snapshot. Collector GET Admin labels is 403. Save without visionJobId and without a draft job creates no label. Grouping-only dump without identity creates no identity label. Gem still 200 if the fake label writer throws (fail-open after commit) — if that path is too expensive to fake, assert commit-then-label order in the Collection test that already reconciles userAction. Unsigned 429 creates no label.

**Seam (one):** `packages/api-contract` `/v1` as implemented by Nest. `/tdd` will not re-quiz this seam.

**Adapters behind the seam (not the test surface):** Postgres via `packages/db`; BullMQ / in-process Vision queue already used by Vision tests; Vision adapter fake; Admin auth guard already used by Admin tests. Label writes are not a new queue adapter.

**Do not add a seam** for Expo Confirm. Do not add an embeddings adapter.

**Modules tested:** Collection Save → Vision label; Vision eval class table; Admin list + alias Apply; Catalog mapper hit after Apply. Admin chip render smoke. No live Gemini.

**Prior art:** `apps/api/tests/collection.test.ts` (KIT-27 userAction at Save), `packages/api-contract/tests/vision-save-action.test.ts`, `apps/api/tests/admin.test.ts` (Staff 403, stamdata list), `apps/api/tests/vision-catalog-mapper.test.ts` (alias map). Admin page tests for User Data chips (`CollectorsPage`).

## Out of Scope

- Grouping Vision labels / bind-versus-guess.
- Vertex / Gemini fine-tune, CLIP, SigLIP, Voyage, Jina, Eve, pgvector, Cloud Vision Product Search.
- Auto-commit of Club, Kit, season, or prompt files.
- Changing OpenRouter pin, Flash-Lite, or the Vision Matcher cap.
- Collector-facing eval chrome on Confirm.
- Export of photos to a vendor training bucket.
- Football Data Seed `seed_join` from Admin Apply.
- Rewriting `user_action` to include kit/player/patch (eval map covers those fields).
- Public Astro, Match-hit, IAP.
- A third Admin waffle place or a new Confirm primitive.

## Linear

- **Project:** KitCollective v1
- **Mode:** feature
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. **Vision Matcher loop** — Complete when a signed-in collector Gems a UserJersey after identity; Staff on staging Admin User Data sees the Vision label (suggested vs selected, eval class) and a Vision improve proposal that is still `proposed`; Apply on an alias proposal upserts CatalogLabel and a following identity can lock that club; Save never waits; Expo Confirm unchanged. Ready to promote integration → staging when that works against staging catalog. Grouping-eval and fine-tune are not this milestone.

## Further Notes

OpenRouter remains a provider (ADR-0044). The loop that gets stronger is CatalogLabel + mapper + (later) prompt tickets from the improve queue. Gold-set live eval against Drive photos stays a separate factory run (`.scratch/Research/vision-matcher-live-eval.md`); it is not this Admin table.
