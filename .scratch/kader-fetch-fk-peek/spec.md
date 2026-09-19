# Kader fetch, live FK, and Catalog peek

Feature spec on **KitCollective Seed**. Live Transfermarkt from chat already proved Apify into development Postgres. Coolify’s Hetzner IP gets HTTP 202 from Transfermarkt; Apify pay-per-event is too expensive as the backfill engine. This slice makes **Kader fetch** the live path, **FK after facts** a real archive ingest into **lane R2**, and **Catalog peek** a page Nicklas can open.

## Problem Statement

Nicklas can seed Superliga facts via Apify, but a Coolify job cannot GET Transfermarkt (HTTP 202, empty body), and he does not want to spend Apify quota as the default. Football Kit Archive live fetch is still a dummy URL, so kits and archive images do not land on the seasons that Transfermarkt just created. There is no page to open after a run — only JSON stats — and he does not want a designed admin yet.

## Solution

Kader fetch (Cheerio on competition-season and kader `plus/1` HTML) is the live Transfermarkt adapter. Coolify uses a Seed proxy (Decodo residential); the job fails closed without that secret. Opt-in Apify stays in the tree and is never an automatic fallback. After that path is green for a Seed scope, a second Seed MCP call (`seed_fk`) live-fetches Football Kit Archive for the same scope, upserts Kit rows on Transfermarkt ExternalId, and **puts archive image bytes in the lane’s R2 bucket** as KitPhoto (`admin_only`, `rights: unresolved`). Nicklas opens Catalog peek (`GET /v1/catalog/peek`) — unstyled HTML listing season, clubs, squad counts, kit identity, and photo counts — not public JPEG URLs, not `apps/admin`.

## User Stories

1. As Nicklas, I want Coolify Kader fetch to use Decodo residential, so that Transfermarkt HTML is not requested from the burned Hetzner IP.
2. As Nicklas, I want the Coolify job to refuse to start Kader fetch when the Seed proxy secret is missing, so that we never burn a 202 empty-body run.
3. As Nicklas, I want Cursor Seed MCP on my Mac to be allowed without a proxy, so that a laptop GET (which returned HTTP 200) can still do a short run.
4. As Nicklas, I want Cheerio (and ordinary HTTP GET) to parse kader HTML, so that we do not add Crawlee, Playwright, or a stealth SDK.
5. As Nicklas, I want jersey numbers read from the kader `plus/1` table, so that we do not hop to a player profile when the row already has id and number.
6. As the job, I want a Player profile fetch only when a kader row still lacks identity or number, so that historical holes are reported rather than paid as a default hop.
7. As Nicklas, I want clubs for a competition season to still come from the Competition season page, so that promotion and relegation stay source-driven (ADR-0011).
8. As the job, I want that competition page fetched once per season, not once per club, so that proxy gigabytes and time stay small.
9. As Nicklas, I want Already seeded club-seasons to skip the Transfermarkt GET, so that Decodo GB and time drop on a second run (ADR-0010).
10. As Nicklas, I want the first live accept of Kader fetch to be a Proof run: one Superliga season, every club, squads and numbers, development, via Coolify and the Seed proxy.
11. As Nicklas, I want that Proof run to use the same Seed sentence and Seed MCP tool as today (`seed_apify`), so that the operator protocol does not change.
12. As Nicklas, I do not want HTML 202 to automatically retry on Apify, so that quota is not spent unless I opt in.
13. As Nicklas, I want Opt-in Apify still selectable by an explicit choice, so that a small chat seed can use the Store actor when I am willing to pay.
14. As Nest, I want zero seed imports and zero Transfermarkt HTTP, so that `/v1` never becomes the scraper.
15. As CI, I want recorded kader HTML fixtures, so that PRs never call Transfermarkt, Decodo, or Apify.
16. As tests, I want a fake FetchAdapter to keep proving skip without the network.
17. As Nicklas, I want market value, agent PII, and Transfermarkt branding dropped before map, so that facts-only stays locked (ADR-0002).
18. As Nicklas, I want production rejected from chat, so that a sentence cannot fill the live catalog (ADR-0009).
19. As Nicklas, I want FK after facts: no live Football Kit Archive fetch until that Seed scope already has Club and Season rows.
20. As Nicklas, I want the second MCP tool (`seed_fk`) for that same scope, so that a TM failure does not start FK and I can stop after stamdata.
21. As Nicklas, I do not want TM and FK fused into one MCP tool in this slice, so that the two hops stay explicit.
22. As the FK job, I want live archive HTML (or the site’s actual kit listing pages) for that competition and season range, so that fixture JSON is not what lands in development.
23. As the FK job, I want each Kit joined on Transfermarkt ExternalId for club and season, so that FCK 2015/16 kits sit on the same Season UUID as the kader.
24. As the FK job, I want kit type and manufacturer mapped into Kit rows, so that home/away/third/gk identity exists without a human spreadsheet.
25. As the FK job, I want archive image **bytes written to the lane R2 bucket** (development bucket on the Proof run) via the existing ObjectStoreAdapter, so that photos are not only a Postgres flag.
26. As the FK job, I want each KitPhoto row to store the R2 object key with `visibility: admin_only` and `rights: unresolved`, so that Expo, Astro, and OG never receive those bytes (ADR-0005).
27. As Nicklas, I want Coolify FK fetch to use the same Seed proxy if Football Kit Archive also 202s from CX33, so that we do not discover a second burned IP after TM works.
28. As Nicklas, I want FK to refuse the run when club or season is missing, so that kits cannot attach to the wrong year.
29. As Nicklas, I want a second FK run to upsert on FK ExternalId rather than duplicate kits, so that re-runs are safe.
30. As CI, I want FK tests to keep using fixture kits and an in-memory object store, so that PRs never hit Football Kit Archive or R2.
31. As Nicklas, I want Catalog peek as unstyled HTML at `GET /v1/catalog/peek`, so that I can open a URL after the two MCP calls and see the run.
32. As Nicklas, I want peek to list season, club names, squad counts, kit types, and photo counts, so that I can see FCK that year had a trup and kits — not only a JSON integer blob.
33. As Nicklas, I do not want peek to `<img>` archive JPEGs from R2 on that URL, so that admin_only bytes stay off the public web.
34. As Nicklas, I do not want `apps/admin` or `/to-design` in this slice, so that peek is not the product admin.
35. As a machine, I want `GET /v1/catalog/stats` to remain JSON counts, so that agents can still curl without parsing HTML.
36. As Nicklas, I want peek and stats to read the same development Postgres the seed jobs wrote, so that the page is evidence of the run, not a second database.
37. As Coolify, I want Seed proxy, `DATABASE_URL`, and `R2_*` names documented in `.env.example` only, so that secrets stay in the development Environment.
38. As Nicklas, I want a long Season range to remain a Coolify one-shot job, so that Kader fetch can run while the Mac sleeps (ADR-0012).
39. As Nicklas, I want skip/fetch/mapped (and FK kits/photos written) in the MCP summary, so that chat is not a dump of HTML.
40. As Nicklas, I want holes in a historical kader (missing `#`) reported and the rest of the Seed run continued, so that one empty shirt cell does not abort Superliga.

## Implementation Decisions

- **Live Transfermarkt transport is Kader fetch** (ADR-0015): undici/`fetch` GET + Cheerio parse. Third adapter on the existing FetchAdapter seam (`listClubSeasonPairs`, `fetchClubSeason`). Default for Coolify and Seed MCP unless the operator explicitly selects Opt-in Apify.
- **Seed proxy:** HTTP(S) proxy URL from env (names only in git). Required on Coolify for Kader fetch (and for live FK if that origin 202s). Mac Seed MCP may omit it. Decodo residential; not Decodo Transfermarkt Scraping API; not datacenter; not free-proxy lists.
- **Competition season page once per season**; cache HTML keyed by competition + `saison_id` and club + `saison_id` so Already seeded and retries do not re-download.
- **No Felipeall process.** No Crawlee/Playwright. Profile hop remains the existing Fetch step, not the default.
- **FK after facts** (ADR-0005 unchanged for rights): live adapter on the existing FkFetchAdapter seam. Mapper already requires Transfermarkt club/season ExternalId. Live HTTP replaces `fkapi.example.invalid`.
- **R2 is the photo store, not optional:** ObjectStoreAdapter `putObject` writes bytes to the **lane R2 bucket** (`R2_BUCKET` for that Environment). Postgres KitPhoto holds `object_key`, `admin_only`, `rights: unresolved`. A successful FK Proof run without objects in development R2 is a failed accept.
- **Two MCP tools** remain: `seed_apify` (now Kader fetch by default) then `seed_fk`. Same Seed scope arguments. Agent composes; the human still writes one sentence per hop in chat.
- **Catalog peek** (ADR-0016): new `GET` on the existing Catalog module, `text/html`, unstyled table. Reads the same stamdata as stats. Does not stream R2 objects. `GET /v1/catalog/stats` unchanged (JSON).
- **Nest does not fetch TM or FK.** Peek only reads Postgres.
- **No schema PK change.** ExternalId systems remain `transfermarkt` and `fkapi`.
- Lane default development; production rejected.

## Testing Decisions

Good tests assert external behaviour at the public interface: which club-seasons were requested, which rows and ExternalIds exist, which jersey numbers landed, which R2 keys were written, which HTML peek lists. They do not call Transfermarkt, Football Kit Archive, Decodo, Apify, or live R2. They do not assert Cheerio selectors as the product contract (fixture HTML in, mapped facts out).

**Seams** (existing; `/tdd` uses these, highest first):

1. **`runSeed` / FetchAdapter (highest for TM).** Interface: Seed scope + lane + injected FetchAdapter. Behaviour: Kader fetch adapter (or fake) walks pairs; skip Already seeded; map numbers; refuse production. Adapters: fake that records requests; recorded kader HTML fixtures; existing nested fixture; Opt-in Apify recordings remain for that adapter’s tests. Prior art: `seed/apify` CLI tests and live-adapter recording tests.
2. **`runFkSeed` / FkFetchAdapter + ObjectStoreAdapter (highest for kits + R2).** Interface: same competition/season scope + fetch + `putObject`. Behaviour: refuse missing club/season; upsert Kit; **put bytes**; KitPhoto `admin_only`. Adapters: fixture kits; in-memory object store that records keys. Prior art: `seed/fkapi` seed tests (`photosWritten`, memory store).
3. **Catalog HTTP (peek + stats).** Interface: `GET` stats JSON (existing) and peek HTML. Behaviour: counts and listed club/season/kit fields match inserted stamdata; peek body has no raw photo bytes. Adapter: Nest test app + schema inserts. Prior art: `GET /v1/catalog/stats` tests.

Do not unit-test the MCP SDK. Do not require a screenshot of Decodo’s dashboard as accept — Coolify env key names + a redacted 200 from Kader fetch through proxy are the live evidence.

## Out of Scope

- Product `apps/admin`, `/to-design`, Expo, Astro, Vision, UserJersey.
- Rendering archive JPEGs on Catalog peek or any public URL.
- Automatic Apify fallback; spending Apify quota as the default Coolify path.
- Fusing `seed_apify` and `seed_fk` into one tool.
- Felipeall as a dependency; tommhe14 wrapper / `tmapi-alpha`; dcaribou dump as the live source; licensed Sportmonks/API-Football as the TM replacement.
- Decodo Web Scraping API / browser unlocker as the fetch.
- Full 1990–2027 × 20-league backfill in this milestone (Proof grain is one Superliga season).
- Forced refetch as a polished operator product.
- Production seed from chat.
- Changing UUID PKs.

## Linear

- **Project:** KitCollective Seed
- **Mode:** feature
- **Craft labels:** (unchanged on the project) `craft:backend`
- **Lead:** Nicklas
- **Priority:** None (not named)
- **Milestones** (each is one staging increment — a handful of issues, not the whole product):
  1. Apify seed machine — already complete.
  2. FK seed machine — already complete (fixture + R2 adapter; live HTTP not wired).
  3. Live Transfermarkt from chat — already complete (Apify Proof run).
  4. **Kader fetch, live FK, Catalog peek** — Demoable: Nicklas puts the Decodo secret on the Coolify job; one Seed sentence Kader-fetches one Superliga season into development; a second `seed_fk` call writes Kit rows and **archive bytes into the development R2 bucket**; he opens Catalog peek and sees clubs, squad counts, kit identity, and photo counts (no public kit images). Ready to promote when the same jobs can target staging if named.

## Further Notes

- Glossary: Kader fetch, Seed proxy, Opt-in Apify, FK after facts, Catalog peek, Proof run, Already seeded, ExternalId, Seed run (`CONTEXT.md`).
- ADRs: 0015 (Kader fetch + Decodo; Opt-in Apify), 0016 (peek is Nest HTML), 0002 (facts-only; transport superseded by 0015), 0005 (FK R2, admin_only), 0009–0014 (lanes, MCP, skip, Coolify, one sentence).
- Research: `.scratch/Research/cheap-stamdata-options.md`, `transfermarkt-felipeall-api.md`; CX33 probe 2026-08-21: host `62.238.53.158` → TM HTTP 202 / 0 bytes; Mac → HTTP 200 ~29 KB.
- Next step: `/to-tickets` under milestone **Kader fetch, live FK, Catalog peek**. Do not file tickets from this skill.
