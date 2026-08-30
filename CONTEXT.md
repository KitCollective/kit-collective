# KitCollective

Nordic football-shirt collector product. Use these terms in specs, tickets, commits, and Linear titles.

<!-- factory:generated-start -->
## Orchestration

Generated from `factory.config.json`. Do not put product nouns here.

**Control plane**:
Linear. Status + `ready-for-agent` + blockers decide what runs.
_Avoid_: GitHub Issues as source of truth, Linear Assignee → Agents → Cursor as dispatch

**Runtime**:
PI worker: Compose + `gh` + Linear CLI. Empty `.pi/mcp.json` — Linear MCP is not on the box.
_Avoid_: Cursor Cloud Agents as dispatch, Linear MCP as the worker runtime

**Product MCP**:
Coolify MCP and `kc_seed_mcp` are Desktop or Cloud Agent wiring. Not default PI-worker MCP.
_Avoid_: installing Coolify or Seed MCP on the PI worker as factory dispatch

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
The single workpad comment on an issue. `### Review feedback` is why a pass was sent back. Edited in place — never a second `## Agent Workpad`.
_Avoid_: a new comment thread per agent turn

**Role comment**:
One new top-level Linear issue comment per factory role transition (planner claim, implement → In Review, checker pass/fail, Auto-merge flip/refuse, land success/fail). Separate from the workpad.
_Avoid_: a new comment per tool call; duplicating findings that belong in `### Review feedback`

**Description AC**:
Checker pass ticks `[x]` on Acceptance criteria in the issue **description** and writes one verdict comment per criterion. Rewrites a stale line and comments why — never silently ticks unmet text.
_Avoid_: implement ticking description AC before checker pass; checker pass without updating description when criteria are met

**Signal-up**:
Out-of-scope bug or debt, filed as a new Linear **Triage** issue. Never coded in the current PR.
_Avoid_: expanding the PR, applying `ready-for-agent` to the finding, filing into `Backlog`

**Proposal**:
Out-of-scope feature or optimisation. Same ingress as signal-up (Triage), different label.
_Avoid_: mixing with `signal-up` on the same issue, filing into `Backlog`

**Land**:
Merge to `development` after Auto-merge or Nicklas moves the issue to Merging. Land sets Done only after the merge and writes one role comment with the merge SHA (or merge error on return to Implementing).
_Avoid_: landing to staging or production from an issue run

**Auto-merge**:
Worker moving Ready for merge → Merging when the PR is MERGEABLE, required checks are green, and loop counters under workpad `### Loop counters` are under the cap. Pi delegate is not a gate. On refuse, writes one workpad note and one role comment; Nicklas can still move Merging.
_Avoid_: force-push; treating Auto-merge as land; requiring Pi delegate for flip

**Promotion**:
A Linear **milestone** complete → `staging`; release helper → `production`. Separate from land. Not the whole project at once.
_Avoid_: deploy, release PR as a synonym for land, treating the Linear project as one staging dump

**Triage** *(Linear state)*:
Inbox for Sentry, signal-up, and proposal. Planner never claims.
_Avoid_: the Triage *label group*, `needs-triage`, filing leftovers into `Backlog`

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

**Seed run**:
One chat sentence that starts the full ingest for a Seed scope into a lane’s Postgres. The operator does not chain hops. Internally the job walks Fetch steps and writes rows. Nest never fetches Transfermarkt.
_Avoid_: Nest HTTP seed; “sync all of football”; making the human @ club then season then squad

**Competition query**:
The operator names a league in natural language (`Premier League`, `La Liga i Spanien`, `tyrkiske Superliga`). The Seed job resolves that to a Transfermarkt competition (id + slug + country): catalog alias first, otherwise a Transfermarkt search. Country words disambiguate. Then the existing walk: Competition season page → clubs → kader → numbers.
_Avoid_: a closed hardcoded world list as the only way to name a league; treating every Superliga as Denmark

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
The Cursor Seed MCP server id. Standalone stdio process — not Coolify MCP. Exposes `seed_apify` (Kader fetch / Transfermarkt facts) and `seed_fk` (Football Kit Archive kits + admin_only archive bytes) only. Gets Seed env (lane database, Seed proxy, FK origin, lane R2) — never Coolify API tokens. Coolify MCP stays the host catalog for long one-shot jobs; Seed scope args (`fromSeason` / `toSeason` / `club` + `season`) go through `kc_seed_mcp`, not Coolify `control`. Wired on Desktop or Cloud Agent sessions. Not default PI-worker MCP (kit-harness `.pi/mcp.json` is empty).
_Avoid_: naming the server `seed` in Cursor config; mixing Coolify tokens into the Seed MCP process; using Coolify `control` for ingest scope; fusing `seed_apify` and `seed_fk` into one tool; installing Seed MCP on the PI worker as factory dispatch

**Coolify MCP**:
Cursor MCP server for the Coolify host catalog. Desktop or Cloud Agent wiring. Not installed on the PI worker.
_Avoid_: treating Coolify MCP as factory dispatch; mixing Coolify tokens into `kc_seed_mcp`

**Catalog peek**:
An unstyled HTML page on Nest (`GET /v1/catalog/peek`) so Nicklas can open a URL and see Seed run results: season, club names, squad counts, kit identity and photo counts. Not `apps/admin`, not the design system, not archive JPEGs on a public URL.
_Avoid_: building the product admin; `/to-design`; treating `GET /v1/catalog/stats` JSON as the peek; hot-linking KitPhoto bytes

**Admin SPA**:
The Vite + React operator surface (`apps/admin`). Same Identity as Expo. Chrome in English. CatalogLabel in this surface is requested as `en` (fallback `mul` → `en`). Never indexed. KitPhoto may render here; never on Expo, Astro, or OG.
_Avoid_: Catalog peek as the product admin; a second login product; Expo as the operator UI; Danish chrome as the admin default

**Collector**:
A User in Expo. The same row can later hold Staff access. Not a separate account type.
_Avoid_: a dedicated admin user table; locking `role=admin` out of Expo

**Profil**:
Own collector place in Expo tab slot 5 — identity card, favorites drill, and settings under one person tab. Not the other-collector Detaljer stub.
_Avoid_: copying Vinted marketplace account chrome; KC monogram as the collector Avatar

**Handle**:
The collector's unique public name on Profil and in Indbakke thread rows. Assigned at register from the email local-part with a numeric suffix on collision. Never the email. Availability is `yours`, `available`, or `taken`.
_Avoid_: raw email as the thread-row name; a second login identifier; success-green availability chrome

**Favorit**:
A saved foreign UserJersey — another collector's shirt on the Profil favorites grid. Not own Samling tiles.
_Avoid_: marketplace listing chrome; owner handle on the favorite tile

**Indbakke**:
The collector messages place in tab slot 4 (envelope). Beskeder and Aktivitet are two views of one conversation model. Not Ønske, not marketplace checkout.
_Avoid_: heart / wishlist chrome in slot 4; a second unread model on the Samling bell

**Conversation**:
One thread between two collectors about a UserJersey. Shared unread across Beskeder and Aktivitet. Created when a bud is sent or a reply is posted (later slices).
_Avoid_: two parallel inbox tables; fake threads to avoid empty state

**Bud**:
A collector-to-collector bid message in a Conversation — an integer DKK amount, not payment or checkout. Accept/decline records outcome in the thread; no money moves in this product gap.
_Avoid_: price overlay on Samling tiles; treating bud as a marketplace purchase

**Staff access**:
Authorization on that same User that opens Admin SPA. Stored as `User.role` `admin`. Not a second login and not a second column. Later scoped staff roles may replace this binary grant. An admin may promote or demote another User; not themselves, and not the last admin.
_Avoid_: a second IdP; a parallel `staff_access` column; calling the grant authentication; locking admins out of Expo; self-demote; demoting the last admin

**Take-down**:
Removing one UserJersey and its UserJerseyPhoto bytes. The User remains. Not a Kit delete. Not a hide flag.
_Avoid_: unpublish; soft-hide without a column; deleting the collector by default

**Implement parent**:
The Composer Pi session for the implement role. Owns helpers, the PR, the workpad, and the move to In Review. Writes `### Validation` from the Gate report.
_Avoid_: Hy3 as `PI_MODEL`; Scout or Gate flipping In Review

**Scout**:
Read-only Pi subagent before implement writes. Required on every implement job. Maps files, seams, and risks. Sends paths and grep snippets only.
_Avoid_: editing; opening a PR; moving Linear status; dumping whole files or the workpad to OpenRouter; inheriting Composer; skipping when `OPENROUTER_API_KEY` is missing

**Gate**:
Pi subagent that runs the mechanical half of pre-review (rebase, typecheck, required GitHub checks) and returns a green or red report to the Implement parent. Attempts rebase; a conflict is red — the parent resolves it. Never calls Linear, never writes the workpad, never moves In Review.
_Avoid_: factory-checker; treating Gate as the pass verdict; inheriting Composer; resolving merge conflicts; Linear CLI from Hy3

**Hy3**:
OpenRouter model `tencent/hy3` for Scout (primary), no-think. Gate uses `xiaomi/mimo-v2.5-pro` as primary and Hy3 as first fallback. Scout falls back to MiMo-V2.5-Pro then Composer. Not product Vision. Missing `OPENROUTER_API_KEY` fails those subagents closed (the implement job fails). Prefer OpenRouter Exacto when the client can set it; otherwise the default route to that model id is enough. Last fallback is `cursor/composer-2.5` — not Kimi, not Hy4. Domain helpers and Slop pin `cursor/composer-2.5`; an omitted `model:` makes Pi use Kimi.
_Avoid_: stealth/ox-alpha; Kimi as Scout/Gate fallback; omitting helper `model:`; Hy3 or MiMo for nest/expo/drizzle/ui-ux; Hy3 for planner, factory-checker, or land; blocking the slice on Exacto; pinning Scout/Gate to Hy4 as the default

**Coding job**:
A factory role on the coding slot: implement, factory-checker, auto-merge, or land. Not planner. Auto-merge and land do not spawn Pi.
_Avoid_: treating a Linear claim as a Pi spawn; planner as a coding job

**Planner job**:
Linear-only skip/claim. Own mutex. Wakes on webhook or poll. Does not spawn Pi. May run while coding jobs are live.
_Avoid_: enqueueing planner on the coding mutex; calling planner a Pi session

**Intake job**:
Hourly Linear-only scan of open KIT Triage on the planner mutex (`PI_INTAKE_POLL_MS`, default 1 hour). Promotes well-formed slices, consolidates related leftovers, comments unshaped Sentry. Never claims Implementing. Never spawns Pi. Never sets Linear Agent to Cursor.
_Avoid_: filing leftovers into Backlog with `ready-for-agent`; treating Intake as planner claim; running Intake on the coding slot

**Auto-merge**:
Worker moving Ready for merge → Merging when the PR is MERGEABLE, required checks are green, and Loop cap is clear. Pi delegate is not a gate. On refuse, writes one workpad note and one role comment. Runs on the coding slot with no Pi. Land still merges to development. Nicklas can still move Merging himself.
_Avoid_: force-push; merging to staging or production; treating Auto-merge as land; requiring Pi delegate for flip

**Role comment**:
One new top-level Linear issue comment per factory role transition (planner claim, implement → In Review, checker pass/fail, Auto-merge, land). Separate from the workpad.
_Avoid_: a new comment per tool call; duplicating workpad Review feedback on checker fail

**Description AC**:
Checker pass ticks `[x]` on Acceptance criteria in the issue description and writes one verdict comment per criterion. Rewrites stale lines and comments why — never silently ticks unmet text.
_Avoid_: implement ticking description AC; checker pass without updating description when criteria are met

**Loop cap**:
Either five required-check failure cycles (`ciFailCycles`) or five checker-fail returns (`reviewLoops`) blocks Auto-merge. Counters live under workpad `### Loop counters`. Missing counters fail closed.
_Avoid_: requiring both counters at 5; scraping GitHub as the only source; a synthetic Linear field

**Idle timeout**:
A spawned Pi child with no close and no stdout for 45 minutes (env `PI_JOB_IDLE_MS`) is hung. The harness kills it and frees that coding slot. After Pi emits `agent_end`, the worker kills within `PI_AGENT_END_GRACE_MS` (default 8 seconds) if the child has not closed — that is not Idle timeout and does not Park.
_Avoid_: wall-clock as the only hang signal; leaving the mutex held after kill; waiting out Idle timeout after `agent_end`

**Timeout park**:
The worker moving that hung coding job to Parked after Idle timeout, with `### Review feedback` on the existing workpad. Planner still never claims Parked. Resume is a human status change.
_Avoid_: treating Parked as human-only on this path; planner unparking; Canceled for a hang

**Issue worktree**:
The git worktree for one issue at `/var/lib/kit-pi/worktrees/KIT-n`. The coding-job cwd. Not a second Pi host.
_Avoid_: sandbox as a synonym without saying worktree; one shared checkout for every issue

**Worktree reap**:
Remove that Issue worktree when the issue is Done (merged), Canceled, or Timeout park. The bare mirror stays. A later checkout creates the tree again.
_Avoid_: deleting the mirror; leaving KIT-n after land; treating a human Park as reap

**Capacity gate**:
Before a coding-job spawn, free RAM and worktree-volume disk must clear env floors (default 2 GB RAM, 5 GB disk). If not, the job stays queued and the worker comments the issue; status does not change; not Timeout park.
_Avoid_: starting Pi when the box is full; Parked for a capacity wait; Prometheus as the gate; a new comment on every retry

**Worker health**:
GET /health on the PI worker. HTTP 200 if the process is up. JSON includes planner state, the current coding job (role + identifier) or null, capacity (ram, disk, ready), and `tokens` (last implement / factory-checker input/output per role and model, or null). Missing counts are `unknown`. Never API keys.
_Avoid_: 503 because a job is running, hung, or waiting on capacity; treating planner: active as “a Pi session is running”; inventing token numbers; logging secrets in health JSON

**Token use**:
After an implement or factory-checker Pi job exits, the worker writes input/output counts per role and model onto the existing workpad (`### Token use`). Implement parent is Composer; Scout and Gate are separate OpenRouter lines when those counts exist; factory-checker is Grok. Planner and Intake do not write model token lines (they do not spawn Pi). Unknown counts stay unknown — the job still completes.
_Avoid_: inventing 0; putting API keys on the workpad; logging planner/intake model tokens

**Implement browser**:
Headless Chromium on the PI worker for implement UI evidence (screenshots onto Linear). A Pi package on implement only, and only when the slice is UI. Not planner. Not Intake. Not Nicklas’s Desktop Chrome.
_Avoid_: browser on the planner mutex; attaching to a personal browser profile; loading browser tools on api/db-only implement

**Worker memory**:
One Hermes store on the `kit_pi` volume at `/var/lib/kit-pi/hermes`, outside every Issue worktree. Survives image rebuild and Worktree reap. Not `/root/.pi`. Not a worktree path.
_Avoid_: project-tier memory keyed on Issue worktree cwd; Cursor `MEMORIES.md` or sessionStart dump as a second source of truth

**Memory writer**:
The factory role that may call `memory_add`, `memory_replace`, and `memory_remove` on Worker memory (factory-checker in the full design). Background review, correction detection, and shutdown flush run only on the writer.
_Avoid_: implement, Scout, Gate, or helpers writing the store; land or Auto-merge as writers

**Memory reader**:
Pi roles that may search Worker memory (`memory_search`, `session_search`) but not write. Implement parent, Scout, Gate, and domain helpers in the reader slice. No background review, correction detection, shutdown flush, or `skill_manage`.
_Avoid_: side-channel writes that bypass the tool allowlist; MEMORY.md dump into the system prompt

**Memory policy-only**:
Hermes injects only a short memory policy into the system prompt — not a MEMORY.md dump, not a session_start lesson block. Repo evidence, `CONTEXT.md`, the workpad, and git ratchets still win over a Hermes hit.
_Avoid_: legacy-inject mode; treating Worker memory as factory law without a ratchet
