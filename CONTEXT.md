# KitCollective

Nordic football-shirt collector product. Use these terms in specs, tickets, commits, and Linear titles.

<!-- factory:generated-start -->
## Orchestration

Generated from `factory.config.json`. Do not put product nouns here.

**Control plane**:
Linear. Status + `ready-for-agent` + blockers decide what runs.
_Avoid_: GitHub Issues as source of truth, Linear Assignee → Agents → Cursor as dispatch

**Runtime**:
Cursor Automations + Cloud Agents reading this repo’s harness.
_Avoid_: Conductor board, local-only agents as the factory

**Kickoff**:
`/to-spec` for a new Linear project + milestones. No issues yet.
_Avoid_: creating tickets during spec

**Feature spec**:
`/to-spec` against an existing project.
_Avoid_: a second Linear project for the same effort

**Vertical slice**:
One issue that cuts schema → API → UI → tests and is demoable alone.
_Avoid_: horizontal tickets (schema-only, API-only)

**Dispatch**:
`Backlog` + label `ready-for-agent` + unblocked. Human remains assignee. Linear Agent stays empty (Cursor in that menu starts a Cloud Agent). Planner claim order = Linear priority (`dispatch.priorityOrder`).
_Avoid_: assigning Cursor as Agent or Assignee, treating priority as eligibility

**Workpad**:
The single workpad comment on an issue. `### Review feedback` is why a pass was sent back.
_Avoid_: a new comment thread per agent turn

**Signal-up**:
Out-of-scope bug or debt, filed as a new `Backlog` issue. Never coded in the current PR.
_Avoid_: expanding the PR, applying `ready-for-agent` to the finding

**Proposal**:
Out-of-scope feature or optimisation. Same ingress as signal-up, different label.
_Avoid_: mixing with `signal-up` on the same issue

**Land**:
Merge to `development` after Nicklas moves the issue to Done.
_Avoid_: landing to staging or production from an issue run

**Promotion**:
A Linear **milestone** complete → `staging`; release helper → `production`. Separate from land. Not the whole project at once.
_Avoid_: deploy, release PR as a synonym for land, treating the Linear project as one staging dump

**Triage** *(Linear state)*:
Inbox for Sentry and other intake. Human accepts onto the board. Never auto-dispatch.
_Avoid_: the Triage *label group*, `needs-triage`

**Duplicate** *(Linear state)*:
This work already exists on another issue. No agent action.
_Avoid_: deleting the issue instead of marking duplicate

**Write scope**:
Path globs on an implementation issue the implementer may change.
_Avoid_: treating surface labels as write scope
<!-- factory:generated-end -->

## Language

**Kit**:
Catalog truth for a shirt design (club / season / type). Not a user’s copy.
_Avoid_: shirt as catalog, jersey for the catalog row

**UserJersey**:
A collector’s owned instance of a Kit, with photos and personal fields.
_Avoid_: Kit (for a copy), collection item

**CatalogLabel**:
Locale + kind name for stamdata. The English seed string is not the Danish UI name.
_Avoid_: hardcoding English as the UI label

**Vision suggestion**:
Gemini output. Persist catalog UUIDs after confirm.
_Avoid_: raw model names as foreign keys

**Save**:
Must not wait on Vision, kit completeness, or manufacturer.
_Avoid_: blocking save on inference

**Lane**:
One of `development`, `staging`, `production` — git branch, GitHub Environment, and EAS channel. Same names, different objects.
_Avoid_: environment as a synonym without saying which object

**kc_seed_mcp**:
The Cursor Seed MCP server id. Stdio process exposing `seed_apify` then `seed_fk`. Seed-only env (lane database, Seed proxy, FK origin, lane R2). Not Coolify MCP.
_Avoid_: naming it `seed`; putting Coolify tokens on this server; using Coolify `control` as the Seed scope interface

**Seed run**:
One chat sentence that starts the full ingest for a Seed scope into a lane’s Postgres. The operator does not chain hops. Internally the job walks Fetch steps and writes rows. Nest never fetches Transfermarkt.
_Avoid_: Nest HTTP seed; “sync all of football”; making the human @ club then season then squad

**Seed scope**:
What one Seed sentence covers: a club + one season (squad and numbers), or a named competition + Season range (every club that season, squads and numbers). Superliga is the Proof run; Bundesliga and others are the same loop.
_Avoid_: Superliga-only as the product ceiling; treating a club-season ask as a different product

**Fetch step**:
Internal unit the job uses: resolve club, resolve season, fetch that club-season’s squad, or (only if needed) fetch a player profile. Not what the operator types. Not one nested dump of a club plus the whole roster in a product API.
_Avoid_: exposing Fetch steps as the human chat protocol; product `/v1` seed endpoints

**Player profile fetch**:
An extra Transfermarkt hop for one player. Used only when the squad list row is missing identity or jersey number.
_Avoid_: a profile call for every player when the squad list already has id, name, and number

**Proof run**:
The first live accept of a Transfermarkt path: one Superliga season, every club that season, squad and jersey numbers, into the development lane. Same loop as a full Season range — smaller scope so MCP and Postgres are proven before a multi-hour job. Kader fetch’s first live accept is the same grain, through the Seed proxy on Coolify — not Opt-in Apify.
_Avoid_: treating the proof as the product ceiling; requiring the full 1995/96–2025/26 range before any row is accepted; treating an Apify proof as proof that CX33 can GET Transfermarkt without a proxy

**Already seeded**:
A club + season is already seeded when that pair has a squad with jersey numbers in our Postgres. The next Seed run skips fetching that pair from Transfermarkt.
_Avoid_: skipping every later season because the club exists; still paying Apify and only skipping the database insert

**Competition season page**:
The Transfermarkt page for that league season. The club list for a Seed run comes from there, so promotion and relegation are included.
_Avoid_: a hardcoded Superliga club roster

**ExternalId**:
The vendor’s stable id (Transfermarkt, Football Kit Archive) on our row. Our UUID is the primary key. Same vendor id on a later run finds the same club/player/kit instead of inserting a duplicate.
_Avoid_: using Transfermarkt’s integer as our primary key

**Season range**:
Inclusive seasons of the named competition from a start label to an end label (e.g. Superliga 1995/96–2025/26, Bundesliga 05/06–19/20). The job expands that to every season of that competition in between.
_Avoid_: treating a range as a single season; treating `0001` as calendar year 1991 without saying so; assuming every range is Superliga

**Kader fetch**:
The live Transfermarkt path: HTTP GET of the Competition season page and each club’s kader HTML (`plus/1`), then Cheerio parse of squad and jersey numbers into the existing mapper. Same Seed run / Seed scope as before. Not an Apify Actor run. Not felipeall as a hosted API.
_Avoid_: calling this a Nest scraper; treating Cheerio as anti-bot; fetching a player profile page when the kader row already has id and number

**Seed proxy**:
Outbound HTTP(S) proxy used only for Transfermarkt (and Football Kit Archive when that fetch is live) from Coolify jobs and from `kc_seed_mcp`. Vendors: Decodo residential (per GB) or Decodo Site Unblocker (`unblock.decodo.com` as HTTP proxy). Coolify stores the secret and injects it into the job; `kc_seed_mcp` reads the same **names** from its own env. Kader fetch on Coolify does not run until that secret is present (fail closed).
_Avoid_: Coolify Traefik as the TM unblock; Decodo Web Scraping API (`POST /v2/scrape`); datacenter proxies; public free-proxy lists; a naked GET from CX33 “just to try”

**Opt-in Apify**:
The existing Store-actor FetchAdapter. The operator must explicitly choose it. It is not an automatic fallback when Kader fetch fails or is slow. Quota is spent only when Nicklas opts in.
_Avoid_: retrying HTML 202s on Apify by default; treating Apify as the primary Coolify path

**FK after facts**:
Live Football Kit Archive fetch for the same Seed scope, only after that scope already has Club and Season rows from Transfermarkt. Writes Kit identity and admin_only KitPhoto bytes onto those seasons (ExternalId join). Not before Kader fetch is green for that path. The operator still runs two Seed MCP tools (`seed_apify` then `seed_fk`) for that scope — not one fused tool.
_Avoid_: scraping FK with no TM clubs; treating fixture FK as live archive ingest; showing archive bytes on Expo, Astro, or OG; merging TM and FK into one MCP tool in this slice

**kc_seed_mcp**:
The Cursor Seed MCP server id. Standalone stdio process — not Coolify MCP. Exposes `seed_apify` (Kader fetch / Transfermarkt facts) and `seed_fk` (Football Kit Archive kits + admin_only archive bytes) only. Gets Seed env (lane database, Seed proxy, FK origin, lane R2) — never Coolify API tokens. Coolify MCP stays the host catalog for long one-shot jobs; Seed scope args (`fromSeason` / `toSeason` / `club` + `season`) go through `kc_seed_mcp`, not Coolify `control`.
_Avoid_: naming the server `seed` in Cursor config; mixing Coolify tokens into the Seed MCP process; using Coolify `control` for ingest scope; fusing `seed_apify` and `seed_fk` into one tool

**Catalog peek**:
An unstyled HTML page on Nest (`GET /v1/catalog/peek`) so Nicklas can open a URL and see Seed run results: season, club names, squad counts, kit identity and photo counts. Not `apps/admin`, not the design system, not archive JPEGs on a public URL.
_Avoid_: building the product admin; `/to-design`; treating `GET /v1/catalog/stats` JSON as the peek; hot-linking KitPhoto bytes
