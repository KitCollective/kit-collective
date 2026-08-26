# Kader fetch: queue, cache, OOM, and 403 burst

**Date:** 2026-08-22  
**Product:** KitCollective  
**Effort:** `.scratch/kader-fetch-fk-peek/`  
**Question:** Live Coolify Kader-fetch (Superliga 2015/16 through Decodo residential HTTP proxy) died at ~512M with no CLI output, then survived at `mem_limit: 2g` + `NODE_OPTIONS=--max-old-space-size=1536`. First club (FC Copenhagen, 33 squad rows) mapped; later clubs got Transfermarkt HTTP 403 (first on a player **profile** URL, then kader URLs). Are we actually queuing and caching so the job does not swallow RAM — or can we improve that so OOM (and the 403 burst) is avoided?

Related: [spec.md](./spec.md); ADR-0015; ADR-0012; [cheap-stamdata-options.md](../Research/cheap-stamdata-options.md). Operator observation (this run) is cited as such — not re-measured here. No Transfermarkt HTML was fetched for this note.

## Answer

**There is no request queue and no live HTML cache.** The job is a sequential `for` over club-seasons with `await` (one HTTP at a time). The only cache is an in-memory `Map` of **parsed competition club rows**, not HTML. Fixture HTML on disk is CI-only. Cheerio builds a full in-memory DOM of whatever string `load()` receives, then the parser returns plain squad objects; nothing in the live path retains season HTML in a Map. `mapFacts` upserts **one club-season payload** and keeps counters, not the season.

**The 512M death is not explained by “we held the whole Superliga in RAM.”** Peak fetch RAM from this code is one (maybe two) HTML strings + one Cheerio DOM + a small competition-row cache + a `pg.Pool` (default `max` 10) + one `ProxyAgent`. That is megabytes for ~30 KB gzip kader pages, not 512 MiB. The Coolify **runtime build** in `scripts/wire-coolify-seed-apify-job.sh` is the large unknown: `apt-get`, `git clone`, **full-monorepo** `pnpm install --frozen-lockfile`, then four `tsc` builds **inside the same cgroup as the job**. The committed `seed/coolify/Dockerfile` already does install+tsc at **image build** time; the wired job does not use that image. `NODE_OPTIONS=--max-old-space-size=1536` on a 2 GiB cgroup is Node’s own “2 GiB machine, leave headroom” example — it is not evidence the fetch loop needs a 1.5 GiB heap. Kernel OOM (`SIGKILL`) does not flush stdout; the CLI also prints **only after every club**, so a kill mid-run looks like “no CLI output.”

**The 403 burst is a missing-number → profile-hop → fail-club → next-kader loop with zero delay.** If `plus/1` jersey cells do not parse as integers (`Number.parseInt("#1")` is `NaN`), every row hops to `/profil/spieler/{id}`. One 403 throws, `runSeed` records a club failure, and the next iteration GETs the next kader immediately. There is no 403/429 backoff and no consecutive-403 stop. Profile `h1` `.text()` concatenates the shirt-number span, which matches live labels like `#1 Robin Olsen` **if** hops ran.

**Do not add RAM as the design.** Ranked in-spec work: (1) run the prebuilt seed image so the job cgroup never `pnpm install`/`tsc`; (2) parse `plus/1` numbers so hops are rare; (3) disk-cache HTML by URL and drop Cheerio after parse; (4) polite delay + stop after N consecutive 403/429, and treat a missing profile as a hole (spec), not a failed club; (5) optional `connections: 1` and a Decodo sticky `session` username param. **Not:** BullMQ for this CLI, Apify failover, Decodo Scraping API, holding all season HTML in a Map.

---

## 1. Today: queue, cache, what RAM is spent

### No request queue

`runSeed` walks pairs in a single `for` with `await` (`seed/apify/src/run.ts`). Skip via `isClubSeasonAlreadySeeded`; otherwise `fetchClubSeason` → `normalize` → `mapFacts` inside `try/catch`. Failures append to `summary.failures` and the loop continues. There is no BullMQ, Redis, or in-process job queue in this CLI.

CONTEXT / ADR-0012 / spec: a long Season range is a **Coolify one-shot job**, not Nest. BullMQ in `.scratch/Architecture/tech-stack.md` is the Nest worker (wishlist, push, Vision) in `apps/api` — a different process.

`listClubSeasonPairs` (live) also walks seasons sequentially and GETs each competition page once, then expands clubs (`kader-fetch-adapter.ts` `createLiveAdapter`).

Inside one club: competition (cache hit after first) → one kader GET → `resolveProfiles` `for` with `await fetchProfile` (`squad-profile-hop.ts`). **Sequential. No parallel fetches. Backpressure = the `await` chain only.**

### No live HTML disk cache

| Store | What it holds | Live? |
| --- | --- | --- |
| `createKaderHtmlStore` (`kader-html-store.ts`) | `readFile` of `competitions/`, `kader/`, `profiles/` under `SEED_KADER_HTML` | **Fixture / CI only** (`resolve-fetch-adapter.ts`: `kaderHtmlDir`) |
| `competitionCache` (`kader-fetch-adapter.ts`) | `Map<string, ActorSeasonClubRow[]>` keyed `DK1:2015` | Live + fixtures. **Parsed rows, not HTML** |
| Live `fetchHtml` | Returns a `string`; parser `load`s it; locals go out of scope | **Not written to disk** |

Spec / Implementation Decisions: “cache HTML keyed by competition + `saison_id` and club + `saison_id`.” That disk cache is **not implemented** on the live path. Competition page is fetched once per season **in process** because the Map hits; a killed/retried container fetches it again (unless Already seeded skips later clubs).

Already seeded (`seeded.ts`, ADR-0010): skip **network** for a club-season that already has a numbered squad in Postgres. That is identity skip, not HTML reuse for a failed club.

### What is held at once (from code, not a profiler)

**One club-season at a time after list expansion:**

1. `pairs`: `{ clubExternalId, seasonLabel }[]` for the scope — small strings. Superliga 2015/16 is one season × clubs on the competition page (ADR-0011).
2. `fetchHtml` → full HTML `string`. Prior research measured ~30 KB gzip / ~29 KB Mac 200 (`cheap-stamdata-options.md`; spec Further Notes). Uncompressed live pages can be larger; **this note did not re-fetch TM.**
3. `cheerio.load(html)` — in-memory DOM of that string ([Cheerio loading](https://cheerio.js.org/docs/basics/loading): “you pass in the document yourself”). `$` is function-local in `parseKaderHtml` / `parseCompetitionSeasonHtml` / `parsePlayerProfileHtml`. After return, only `squadRows` / club rows / a small profile object remain. **There is no season-wide HTML Map.**
4. Profile hops: one extra HTML + Cheerio per missing number, sequential; previous profile string is GC-eligible.
5. `mapClubSeasonToPayload`: one club’s `players[]` in a `TransfermarktRawPayload` with a single season/club (`actor-mapper.ts`). `normalize` copies that. `mapFacts` upserts it and returns counts (`map/index.ts`). `addMapResults` sums integers only (`run.ts`). **The whole season is not retained in RAM.**

**Not a queue of bodies:** `createProxyFetchHtml` always `await response.text()` then throws on `!ok` (`proxy-config.ts`). The 403 body is allocated then dropped (error object stores `status` + `url` only). undici: consume or cancel the body or connections stall ([undici README](https://github.com/nodejs/undici/blob/main/README.md) “Garbage Collection”). The **non-proxy** `defaultFetchHtml` throws on `!ok` **before** `.text()` — Coolify live path uses the proxy helper when `SEED_PROXY_URL` is set (`resolve-fetch-adapter.ts`).

**`ProxyAgent`:** one agent for the process; `close()` in CLI `finally` (`cli.ts`, `proxy-config.ts`). Constructed as `new ProxyAgent(proxyUrl)` with **no** `connections` cap. undici `Agent`/`Pool` default `connections` is **unlimited** (`null`) — a new client/socket per *concurrent* dispatch ([Agent.md](https://raw.githubusercontent.com/nodejs/undici/main/docs/docs/api/Agent.md), [Pool.md](https://raw.githubusercontent.com/nodejs/undici/main/docs/docs/api/Pool.md)). This CLI does not dispatch concurrent TM GETs, so that default should not multiply sockets from JS parallelism. Still no application-level queue.

**`pg.Pool`:** `createDb` is `new Pool({ connectionString })` (`packages/db/src/migrate.ts`) — no `max`. node-postgres default **`max` is 10** ([Pool API](https://node-postgres.com/apis/pool)). Sequential upserts typically use one client at a time; ten idle backends are not a 512 MiB explanation. Connection string comes from `DATABASE_URL` (name only).

### Where RAM actually goes on Coolify (two images)

**Intended prebuilt path** — `seed/coolify/Dockerfile` / `Dockerfile.remote`: `pnpm install` + four `tsc` in **build stages**; runner copies `node_modules` + `seed/` and is meant to `node dist/cli.js`. Compose file `docker-compose.apify-job.yml` `build.dockerfile: seed/coolify/Dockerfile`, `command: pnpm --filter @kit/seed-apify exec node dist/cli.js …`.

**Wired live path** — `scripts/wire-coolify-seed-apify-job.sh` comment: “Runtime clone avoids compose build/dockerfile_inline on the CX33 host.” It posts compose with `image: node:22-bookworm-slim` and `bash -lc` that, **in the job container**, runs:

`apt-get install git` → `git clone --depth 1` → `pnpm install --frozen-lockfile` (workspace root: Expo, Nest, Astro, seed, …) → `pnpm --filter @kit/domain|@kit/db|@kit/seed-shared|@kit/seed-apify build` (four `tsc`) → `node dist/cli.js`.

That install+tsc RSS is **not measured in-repo**. It is the only step whose working set is plausibly hundreds of MiB **before** Cheerio. Disk `node_modules` is not RSS; `tsc` and `pnpm` processes are. After they exit, Node loads compiled `dist/` — smaller than compile, still sharing the same 512 MiB/2 GiB cgroup.

`NODE_OPTIONS` is **not** in committed compose, wire script, or `.env.example`. Operator-only on the surviving run.

---

## 2. OOM mechanism (512M, no stdout)

### CLI output design

`seed/apify/src/cli.ts` logs JSON **once**, after `runSeed` returns. There is no per-club `console.log`. String `seed-cli-starting` is **not in this repo** (unknown: Coolify UI, operator `echo`, or an uncommitted command). If Node is killed before the final `console.log`, stdout is empty by design.

Piped stdout is block-buffered; `SIGKILL` does not flush ([Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/): kernel OOME kills processes; `SIGKILL` is not catchable). Node **V8 heap** exhaustion prints a fatal “Last few GCs” dump to stderr ([CLI `--heapsnapshot-near-heap-limit`](https://nodejs.org/docs/latest-v22.x/api/cli.html) describes abrupt **system** termination when RSS exceeds what the system allows — distinct from a JS exception).

**Unknown without the Coolify exit code:** 137 / OOM-killed vs V8 heap abort. “No CLI output” after a start banner is consistent with **cgroup kill** and/or **end-only logging**. It is not evidence that fetch held the season.

### Heap vs cgroup

`--max-old-space-size=SIZE` is V8 **old space in MiB**, not Docker RSS. Approaching it increases GC; it does not include native/`arrayBuffers`/pg/undici ([Node 22 CLI](https://nodejs.org/docs/latest-v22.x/api/cli.html); [Understanding and Tuning Memory](https://nodejs.org/en/learn/diagnostics/memory/understanding-and-tuning-memory): `rss` vs `heapUsed`).

Same Node page: *“On a machine with 2 GiB of memory, consider setting this to 1536 (1.5 GiB) to leave some memory for other uses.”* Operator `mem_limit: 2g` + `1536` matches that example. If old space is allowed to grow toward 1536 MiB inside a **512 MiB** cgroup, the **kernel** wins first (no JS flush). Raising cgroup to 2g lets that heap exist; it does not prove the seed loop needed it.

Compose: `mem_limit` is a hard cap; if both `mem_limit` and `deploy.resources.limits.memory` are set they **must be consistent** ([Compose services spec](https://compose-spec.github.io/compose-spec/05-services.html)). `deploy.resources.limits.memory` is the Deploy spec form ([Compose deploy](https://docs.docker.com/reference/compose-file/deploy/)). Coolify `Service.php` sets `compose_parsing_version` default **`5`** on create ([coollabsio/coolify `app/Models/Service.php`](https://github.com/coollabsio/coolify/blob/d6864ce3/app/Models/Service.php)). This session did not find `mem_limit` mapping in a `parsers.php` snapshot. Operator: `deploy.resources` 1G ignored; `mem_limit: 2g` applied — treat as Coolify-parser behaviour, not Compose-on-Swarm.

`memswap_limit: 2g` with `mem_limit: 2g` means **no swap** (swap total equals memory) ([Compose `memswap_limit`](https://compose-spec.github.io/compose-spec/05-services.html); [Docker `--memory-swap`](https://docs.docker.com/engine/containers/resource_constraints/)). A 512M cap with equal swap is a hard stop.

### Verdict on “is fetch-loop RAM the eater?”

**Primary suspect: runtime clone + pnpm + tsc in the job cgroup**, plus **end-only logs** hiding a mid-run kill. **Secondary:** Node default/old-space vs 512M cgroup (RSS > heap). **Not primary:** Cheerio of one kader page, `competitionCache` of ~dozen `{clubId,clubName}`, or Pool max 10.

If `seed-cli-starting` truly ran **immediately before** `node dist/cli.js`, install/tsc already finished in that container and the kill was **Node RSS** (module load, first Cheerio, or pg) under 512M — still not “all clubs’ HTML.” Numeric RSS at death: **unknown** (no `process.memoryUsage()` in CLI).

---

## 3. 403 mechanism (parser × hops × fail-open loop)

### How GETs multiply

Live URLs (`kader-fetch-adapter.ts`):

- Competition once per season: `…/{slug}/startseite/wettbewerb/{tmCode}/saison_id/{year}` (cached as parsed clubs).
- Kader: `…/-/kader/verein/{clubId}/saison_id/{year}/plus/1`.
- Profile: `…/-/profil/spieler/{playerId}` when `squadRowNeedsProfile`.

Hop predicate (`squad-profile-hop.ts` / `resolvePlayer` in `actor-mapper.ts`): missing `playerId` **or** `shirtNumber === null` **or** `undefined`.

Jersey parse (`kader-html-parser.ts`): `.rn_nummer` else `.rueckennummer` else first `td.zentriert`, then `Number.parseInt(trimmed, 10)`. Empty / `-` / `–` → `null`. **`Number.parseInt("#1", 10)` is `NaN` → `null` → hop.** Fixtures use bare digits (`fixtures/kader-html/kader/190-2015.html`). Live TM cells were not inspected here. If live `plus/1` prefixes `#`, **every row hops**.

Tests: hop when fixture `191-2015.html` has `-`; **no hop** when numbers parse (`kader-fetch-adapter.test.ts`). `onMissingJerseyNumber` is a test hook, not CLI output.

If 33 FCK rows all hopped: 1 competition + 1 kader + 33 profiles **before club 2**, sequential, **no delay** (grep of `seed/apify`: no `sleep` / backoff / 429 handling).

### Labels like `#1 Robin Olsen`

`parsePlayerProfileHtml`: ` $("h1.data-header__headline-wrapper").text().trim()`. Cheerio `.text()` is all descendant text ([loading docs](https://cheerio.js.org/docs/basics/loading)). If the live h1 wraps a shirt span (`#1`) plus the name, the CatalogLabel becomes `#1 Robin Olsen`. That is expected **if profile hops ran**. Kader `playerLink.text()` could also concatenate a number overlay. Unknown which ran on FCK without saved HTML.

### Fail club, then immediately fetch the next kader

`resolveProfiles` does not catch. A 403 from `fetchHtml` is `TransfermarktHttpError` (`Transfermarkt HTTP ${status} for ${url}`). That rejects `fetchClubSeason`. `runSeed` catches, pushes `{ clubExternalId, season, error }`, **does not stop**, next `pair` → `fetchKader` → another GET.

Operator: first 403 on a **profile** URL, then kader URLs. That matches: hops started (numbers missing or `#` parse miss) → TM 403 on profile → later clubs still requested kader on a blocked session/IP.

Missing profile after a hop that “succeeded” with empty parse throws `Missing player profile` / `Invalid player profile` (`actor-mapper.ts`, `parsePlayerProfileHtml`) — also fails the **whole club**, not one hole. Spec user story 40 / Fetch step: holes reported, rest continues. Current mapper is fail-closed per club on one bad row.

No circuit breaker: N consecutive 403s still walk the rest of the season.

### Decodo / TM (names only; no scrape)

Decodo **residential HTTP proxy** (not Scraping API; ADR-0015): sticky session via username params `session` and `sessionduration` (default sticky 10 minutes, 1–1440) ([advanced parameters](https://help.decodo.com/docs/residential-proxy-advanced-parameters); [custom sticky sessions](https://help.decodo.com/docs/residential-proxy-custom-sticky-sessions)). Omit `session` → rotating IP. Paid residential marketing copy says unlimited concurrent sessions; **no numeric polite-delay** on those help pages. Free-proxy **thread** 429 is a different product.

`SEED_PROXY_URL` is passed whole to `ProxyAgent` — this code does not add `session-…`. Whether the secret already contains a sticky session: **unknown** (do not log the URL).

Transfermarkt `robots.txt` (this session’s HTTP GET timed out; content as published at [https://www.transfermarkt.com/robots.txt](https://www.transfermarkt.com/robots.txt)): `User-agent: *` disallows `/ceapi`, `/quickselect`, `/jumplist`, `/navigation/getSubNavigation`; `wget` `Disallow: /`; `bingbot` `Crawl-delay: 3`; many named AI bots `Disallow: /`. Kader/profile paths are not in that `*` disallow list. License URL in the file: `https://www.transfermarkt.de/license.xml` (this session: HTTP 503). ADR-0002 already records ToS §11.1 / reserved TDM. Seed `User-Agent`: `KitCollective-Seed/1.0 (+https://github.com/KitCollective/kit-collective)` — not `wget`, not bingbot (no crawl-delay applied to us by robots). 403 is TM anti-bot / rate behaviour, not a robots.txt “you may crawl kader at full speed” grant.

---

## 4. Improvements (ranked, implementable, in-spec)

1. **Prebuilt job image (RAM + time, biggest OOM lever)**  
   Use `seed/coolify/Dockerfile` or `Dockerfile.remote` so `pnpm install` / `tsc` happen at **image build**, not in `mem_limit`. Change `wire-coolify-seed-apify-job.sh` off `node:22-bookworm-slim` + runtime clone. Job command: `node dist/cli.js` (or compose’s `pnpm exec node dist/cli.js`). Still fail-closed without `SEED_PROXY_URL` on Coolify.

2. **Parse `plus/1` so shirt numbers do not force hops**  
   Accept `#1` / `# 1`; prefer `.rn_nummer` only; do not fall through to a `td.zentriert` that concatenates name+number. Strip shirt prefix from profile `h1` if a hop still happens. Spec stories 5–6, 40.

3. **Disk cache of HTML keyed by URL (or club+season / player id)**  
   Reuse on retry; skip network for already-fetched pages (spec Implementation Decisions). After `parse*`, drop the string and Cheerio (already mostly true if locals are not stored — persist **bytes on disk**, not a RAM Map of HTML). Do **not** hold all season HTML in a `Map`.

4. **Polite delay + 403/429 backoff; stop after N consecutive 403s**  
   One failed profile = hole + continue club (do not throw). Log warning (CLI/summary), do not abort Superliga. Optional jitter. Aligns with spec 40 and ADR-0013 (profile only if needed).

5. **Optional:** `new ProxyAgent({ uri, connections: 1 })` (undici cap); Decodo `session` + `sessionduration` in the **secret** (document the **parameter names**, not values). Sequential CLI already ≈ one in-flight GET.

**What not to do**

- BullMQ/Redis for this seed CLI (ADR-0012, spec 38, Nest jobs ≠ this process).
- Automatic Apify fallback (ADR-0015, spec 12).
- Decodo Scraping API / browser unlocker (ADR-0015).
- Caching all season HTML in memory.
- “Add more RAM” as the architecture (2g is an ops floor so Node+pnpm can start; design is less work in the cgroup + fewer GETs).

---

## 5. Recommended design for a future Linear issue (do not file)

**One vertical slice:** Coolify Kader fetch stays on Decodo residential HTTP; Proof grain Superliga one season; no Apify; no Nest scrape.

**Acceptance criteria (draft)**

- Wired Coolify job starts from a **prebuilt** seed image: no `pnpm install` / `tsc` in the job container. Evidence: compose/wire command is `node dist/cli.js` (or equivalent) on `kit-collective-seed` (or documented image name).
- Live kader `plus/1` fixtures (recorded HTML, not live TM in CI) parse jersey integers including `#N`; profile hop count is 0 when id+number present.
- Live adapter writes HTML to a cache directory keyed by URL; second `fetchClubSeason` for the same club-season in one process does not call `fetchHtml` for that URL; Cheerio is not stored on the adapter.
- Injected 403 on a profile: club summary records a hole; other squad rows map; run continues. N consecutive 403/429: run stops fetching TM (fail closed for the rest) and still prints JSON summary (incremental or final).
- No `SEED_FETCH=apify` unless operator-set; no Scraping API client.
- Tests hermetic (`SEED_KADER_HTML` / fake `fetchHtml`).

**write-scope hint:** `seed/apify/**` (parser, hop, cache, backoff, CLI progress log). If the image path changes: `seed/coolify/**`, `scripts/wire-coolify-seed-apify-job.sh`. Do not widen into `apps/api` or BullMQ.

**Gate:** Green if those ACs + unit tests; Yellow only if Proof still needs a human-recorded live 200 through proxy (env names `SEED_PROXY_URL`, `SEED_REQUIRE_PROXY`, `DATABASE_URL`).

---

## Sources

**Repo:** `seed/apify/src/run.ts`, `fetch/kader-fetch-adapter.ts`, `fetch/kader-html-store.ts`, `fetch/kader-html-parser.ts`, `fetch/squad-profile-hop.ts`, `fetch/actor-mapper.ts`, `proxy-config.ts`, `cli.ts`, `resolve-fetch-adapter.ts`, `map/index.ts`, `seeded.ts`; `packages/db/src/migrate.ts`; `seed/coolify/Dockerfile`, `Dockerfile.remote`, `docker-compose.apify-job.yml`; `scripts/wire-coolify-seed-apify-job.sh`; `CONTEXT.md`; ADRs 0002, 0008, 0010–0013, 0015; spec.md.

**External:** [Node 22 CLI `--max-old-space-size`](https://nodejs.org/docs/latest-v22.x/api/cli.html); [Node memory tuning](https://nodejs.org/en/learn/diagnostics/memory/understanding-and-tuning-memory); [undici Agent](https://raw.githubusercontent.com/nodejs/undici/main/docs/docs/api/Agent.md) / [Pool](https://raw.githubusercontent.com/nodejs/undici/main/docs/docs/api/Pool.md) / [README body consume](https://github.com/nodejs/undici/blob/main/README.md); [Cheerio load](https://cheerio.js.org/docs/basics/loading); [node-postgres Pool](https://node-postgres.com/apis/pool); [Decodo sticky / advanced params](https://help.decodo.com/docs/residential-proxy-advanced-parameters); [Compose mem_limit](https://compose-spec.github.io/compose-spec/05-services.html); [Compose deploy.resources](https://docs.docker.com/reference/compose-file/deploy/); [Docker memory / OOME](https://docs.docker.com/engine/containers/resource_constraints/); [Coolify Service.php parser v5](https://github.com/coollabsio/coolify/blob/d6864ce3/app/Models/Service.php); [transfermarkt.com/robots.txt](https://www.transfermarkt.com/robots.txt).

This note feeds `/grill-with-docs` / `/to-tickets`. It does not open Linear issues or a PR.
