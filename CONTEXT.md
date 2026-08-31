# KitCollective

Nordic football-shirt collector product. Use these terms in specs, tickets, commits, and Linear titles.

<!-- factory:generated-start -->
## Orchestration

Generated from `factory.config.json`. Do not put product nouns here.

**Control plane**:
Linear. Status + `ready-for-agent` + blockers decide what runs. Implement and factory-checker enqueue only with `ready-for-agent`.
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

**Football Data Seed**:
The Linear project for vendor ingest: Transfermarkt hierarchy, then Football Kit Archive hierarchy, then Join workflow, then Cross MCP. Successor to KitCollective Seed. Still the one seed board beside the KitCollective product project.
_Avoid_: a third Linear project; filing fetch tickets on the product board; keeping KitCollective Seed alive beside this one

**Hierarchy grain**:
One addressable unit of the football tree: League, League season, Club, Club season, NationalTeam, NationalTeam season, Player, or Player season. Each grain is fetch → normalize (our fields + ExternalId) → map, with a Seed reference. Club and NationalTeam are siblings — not a kind on one row. The first public interface of Football Data Seed — not the one-sentence walk.
_Avoid_: one nested dump as the first accept; calling a grain a Seed run; stuffing a national side into Club; exposing Fetch steps as the chat protocol

**NationalTeam**:
Catalog side for a country team (Denmark, Sweden). Own table, UUID + CatalogLabel + ExternalId. Not a Club. Kits hang off `nationalTeamId`.
_Avoid_: a Club row with `kind: national` as the product model; treating Club search as the only name for a national side

**Hierarchy proof**:
The first live accept of Transfermarkt Hierarchy grains in the development lane: Superliga 2010/11 for every Club grain that season, and Denmark men at World Cup 2010 for NationalTeam grains. Women’s national sides use the same loop — not the first accept. Not a fifth milestone.
_Avoid_: treating the full 1995/96–2025/26 range as the first accept; treating Superliga as the only team kind; requiring a women’s side before the men’s World Cup 2010 proof

**Seed reference**:
Documented seed-module interface for a Hierarchy grain (inputs, output fields, ExternalId, forbidden fields). Not a Nest `/v1` seed endpoint.
_Avoid_: product `/v1` seed; scrapers on the Nest request path; treating Catalog peek as the reference

**Join workflow**:
The composed walk that fills a named competition season (Club sides or NationalTeam sides, then FK kits on those sides) and proves stamdata plus image bytes in the lane. Third Football Data Seed milestone. Not MCP.
_Avoid_: treating the walk as the first accept; fusing TM and FK into one MCP tool before the walk is proven; a club-only walk as the product ceiling

**Seed MCP**:
The Football Data Seed MCP server. Own URL on a unique hostname. Coolify may host the container; ingest chat talks only to this URL. Long jobs run in that service. Cross MCP milestone. Speaks Hierarchy grains and the Join workflow. Coolify MCP stays Docker and host only.
_Avoid_: Coolify `control` for ingest; sharing the Coolify MCP URL; calling Coolify MCP the seed interface; treating `kc_seed_mcp` stdio as the Cross MCP accept; a laptop-only stdio server as the accept

**Seed MCP token**:
Bearer token required on every Seed MCP request. Fail closed if missing. The env **name** is documented; the value is never in git.
_Avoid_: anonymous public MCP; putting the token in the repo or in client bundles; treating Coolify’s API token as this token

**Cross MCP**:
The last Football Data Seed milestone: a human sentence over Hierarchy grains and the Join workflow, served by Seed MCP on its own URL. Not the first accept.
_Avoid_: MCP as milestone 1; routing ingest through Coolify MCP

**Vendor research**:
The first Football Data Seed issue, and the opening slice of later milestones. Maps what Transfermarkt and Football Kit Archive can yield, what we keep as stamdata, and what UI or backend flows can use. Blocks every other issue on this project until the field catalog is accepted.
_Avoid_: implementing grains before the field catalog; researching by scraping every league; treating ADR-0002 as name-and-number only

**Rich grain**:
When a Hierarchy grain is fetched, take every usable fact for that entity so a later UI or backend flow does not need a second vendor hop. Club facts, **Honours** (Club, NationalTeam, Player), kader body facts (position, DOB, nationality, height, foot), player identity depth (including place of birth, home-country name, Player photo, jersey number history), kit sponsor and Kit colours are **stamdata now** once Vendor research named them. Still drop market value, agent PII, and vendor branding logos. Human-only ingest is the reason depth is not deferred.
_Avoid_: a thin id+name+number fetch as the ceiling; a second Seed run just to backfill facts that were on the page the first time; storing market value or agent PII because they were on the page; labelling Club facts, Honours, Kit colours, or Player photo as “later” after the catalog keeps them

**Club facts**:
Transfermarkt club profile / `datenfakten` depth kept as stamdata now on the Club grain: official name, founded date, stadium, capacity, club colour swatches, website. Not kit colours. Not contact address or phone. Human-only Rich grain — take them while on the page.
_Avoid_: treating club colour swatches as Kit colours; storing Tel/Fax/address as stamdata; deferring Club facts to a second Transfermarkt hop

**Player registration**:
Parent club vs loan (club kader) or call-up club (NationalTeam kader). Call-up club on NT `plus/1` is stamdata now; loan markers stay open until season-true HTML is confirmed. Not agent PII.
_Avoid_: trusting Joined / Signed-from columns that show present-day dates on historical kader pages; inventing loan flags when the HTML has none

**Honours**:
Titles and trophies from Transfermarkt `/erfolge/…` for **Club** and **NationalTeam** (`/erfolge/verein/{id}`) and **Player** (`/erfolge/spieler/{id}`). Stamdata now on those grains (Rich grain) — season + title text as listed. Same noun across side and player. Postgres: **`honour`** table — see `.scratch/football-data-seed/schema-gap.md`.
_Avoid_: scraping market-value charts as honours; inventing titles not on the page; treating “Teilnehmer” participation rows as wins without keeping the vendor wording; blocking a Club season squad map only because the club Honours page failed when identity facts already landed

**NationalTeam season**:
Catalog row that a **NationalTeam** fielded a squad in a **Season** — sibling of `TeamSeason` (club path). Stamdata now for Denmark WC 2010 proof. Postgres: **`national_team_season`** + **`player_national_team_season`** — not a Club row.
_Avoid_: stuffing NT squad into `player_club_season`; skipping NT season because `team_season` exists for clubs only

**Player photo**:
Archive portrait of a Player from Transfermarkt (kader or profile). Stamdata now on the Player grain: bytes in the lane object store, `rights: unresolved`, operator-only visibility until cleared — same rights pattern as KitPhoto. Postgres: **`player_photo`** table — see schema-gap.
_Avoid_: treating the face image as ADR-0002 “TM branding” drop; serving unresolved player bytes on collector surfaces; fetching player images through Football Kit Archive or Decodo-on-FKA

**Jersey number history**:
Transfermarkt `/rueckennummern/spieler/{id}` — season + club or NationalTeam + jersey `#` over a career. Stamdata now on the Player grain (Rich grain). Cross-checks kader `#` and supports collector contests (“who wore 10 that season”). Postgres: **`player_jersey_number`** table — see schema-gap.
_Avoid_: treating current profile shirt number as history; inventing rows Transfermarkt did not list; blocking Club season map only because history fetch failed when kader `#` is already present

**Kit colours**:
Primary and secondary colour name + hex from Football Kit Archive / FKApi. Stamdata now on the Kit grain (extend normalize + schema with the grain). Not Transfermarkt club colour swatches. Postgres: `kit.primary_color_hex`, `kit.secondary_color_hex` — see schema-gap.
_Avoid_: deferring colours because the fixture type is still thin; treating manufacturer brand logos as colours; fetching FKA through Decodo to “unlock” colours

**Tournament squad**:
A competition-specific NationalTeam roster (e.g. World Cup 2010 final 23) as distinct from the calendar-year NationalTeam kader on Transfermarkt. Hierarchy proof still uses the NT season grain; the WC-only cut stays open until a clean vendor page is confirmed.
_Avoid_: treating every calendar-2010 Denmark kader row as a WC starter; inventing FIWC participants from empty HTML

**Human-only ingest**:
Football Data Seed issues stay `ready-for-human` only. Not `ready-for-agent`. Planner does not claim. Humans implement so hierarchy, join, and writes are done carefully.
_Avoid_: `ready-for-agent` on this project's slices; PI dispatch on Football Data Seed; treating this label here as a missing-info wait

**Seed run**:
One sentence that starts the full ingest for a Seed scope into a lane’s Postgres. Composes Hierarchy grains. Lives in the Join workflow milestone (Cross MCP wraps it). Internally the job walks Fetch steps and writes rows. Nest never fetches Transfermarkt.
_Avoid_: Nest HTTP seed; “sync all of football”; making the human @ club then season then squad; treating the Seed run as the first Football Data Seed accept

**Competition query**:
The operator names a league in natural language (`Premier League`, `La Liga i Spanien`, `tyrkiske Superliga`). The Seed job resolves that to a Transfermarkt competition (id + slug + country): catalog alias first, otherwise a Transfermarkt search. Country words disambiguate. Then the existing walk: Competition season page → clubs → kader → numbers.
_Avoid_: a closed hardcoded world list as the only way to name a league; treating every Superliga as Denmark

**Seed scope**:
What one Seed sentence covers: a club + one season (squad and numbers), or a named competition + Season range (every club that season, squads and numbers). Superliga is the Proof run; Bundesliga and others are the same loop.
_Avoid_: Superliga-only as the product ceiling; treating a club-season ask as a different product

**Fetch step**:
Internal hop inside a Hierarchy grain or Join workflow: resolve club, resolve season, fetch that club-season’s squad, or (only if needed) fetch a player profile. Not the documented grain. Not one nested dump of a club plus the whole roster in a product API.
_Avoid_: calling a Fetch step the Hierarchy grain; exposing Fetch steps as the MCP chat protocol before Join workflow; product `/v1` seed endpoints

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
Outbound HTTP(S) proxy used **only for Transfermarkt** from Coolify jobs and from `kc_seed_mcp`. Vendors: Decodo residential (per GB) or Decodo Site Unblocker (`unblock.decodo.com` as HTTP proxy). Coolify stores the secret and injects it into the TM job; `kc_seed_mcp` reads the same **names** from its own env. Kader fetch on Coolify does not run until that secret is present (fail closed). Football Kit Archive / FKApi must **not** use Decodo.
_Avoid_: pointing Decodo at Football Kit Archive; Coolify Traefik as the TM unblock; Decodo Web Scraping API (`POST /v2/scrape`); datacenter proxies; public free-proxy lists; a naked GET from CX33 “just to try”

**Opt-in Apify**:
The existing Store-actor FetchAdapter. The operator must explicitly choose it. It is not an automatic fallback when Kader fetch fails or is slow. Quota is spent only when Nicklas opts in.
_Avoid_: retrying HTML 202s on Apify by default; treating Apify as the primary Coolify path

**FK after facts**:
Live Football Kit Archive fetch for the same Seed scope, only after that scope already has Club or NationalTeam plus Season rows from Transfermarkt. Writes Kit identity (including Kit colours when present) and admin_only KitPhoto bytes onto those seasons (ExternalId join). Club kits and NationalTeam kits are sibling grains in the FK milestone. Not before that path’s facts exist. Join workflow composes the two vendors; Cross MCP wraps that later. Does not use Seed proxy / Decodo.
_Avoid_: scraping FK with no TM sides; treating fixture FK as live archive ingest; showing archive bytes on Expo, Astro, or OG; merging TM and FK into one MCP tool before Join workflow; stuffing national kits onto a Club row; routing FK through Decodo

**kc_seed_mcp**:
The predecessor Cursor Seed MCP server id. Standalone stdio process. Exposes `seed_apify` and `seed_fk` only. Not the Cross MCP accept — that is Seed MCP on its own URL. Not Coolify MCP. Not default PI-worker MCP.
_Avoid_: naming the server `seed` in Cursor config; mixing Coolify tokens into the Seed MCP process; using Coolify `control` for ingest scope; treating this stdio wrapper as Football Data Seed done

**Coolify MCP**:
Cursor MCP server for the Coolify host catalog — Docker and host management only. Desktop or Cloud Agent wiring. Not installed on the PI worker. Not ingest.
_Avoid_: treating Coolify MCP as factory dispatch; mixing Coolify tokens into Seed MCP; using Coolify `control` as the seed interface; sharing Coolify’s MCP URL with Seed MCP

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
Own collector place in Expo tab slot 5 — identity card, favorites drill, and settings under one person tab. Not Peer Profil.
_Avoid_: copying Vinted marketplace account chrome; KC monogram as the collector Avatar; treating Detaljer stub as the product peer profile

**Peer Profil**:
Another collector's public place: Avatar, Handle, About me, location per Vis by, and a 4:5 grid of that collector's non-private UserJerseys. No settings, no Favoritter-of-theirs. Entries include Søg Handle hit, foreign UserJersey detail owner, and Indbakke Detaljer. Overflow can Rapportér / Blokér (same Moderation as Indbakke). A blocked peer is not shown — no grid, no profile, both directions.
_Avoid_: mirroring own Profil settings; showing private copies; a second Detaljer stub as the only peer surface; browse that ignores block

**Handle**:
The collector's unique public name on Profil and in Indbakke thread rows. Assigned at register from the email local-part with a numeric suffix on collision. Never the email. Availability is `yours`, `available`, or `taken`.
_Avoid_: raw email as the thread-row name; a second login identifier; success-green availability chrome

**Private UserJersey**:
Owner-set hide on one UserJersey. Default after Save is visible (not private). Setting private clears åben for bud — the two never stay on together. When private, other collectors must not see it on Søg, on a Peer Profil grid, via foreign detail GET, or as a Match target. The owner still sees it on own Samling.
_Avoid_: using biddingEnabled as privacy; soft-hide without a column; treating Take-down as privacy; private-by-default Save; private + åben for bud at once

**Søg**:
Compass tab (slot 2). Home is a magazine of shelves (clubs, åbne for bud, collectors, and more jerseys) over non-private foreign UserJerseys — not a single flat grid as the only chrome, and not Trøjer|Katalog|Samlere home tabs. Typeahead replaces or covers that magazine with hits for stamdata and Handles; choosing a hit opens a drill. Own-collection find stays on Samling and genveje. Browse, catalog drills, Peer Profil, and Send bud stay free of Entitlement in this feature. Blocked peers' copies and profiles are omitted. Product name is Søg — not Discovery.
_Avoid_: Discovery as the place name; find-in-own-collection as Søg's primary job; limiting Søg to åben-for-bud rows only; Trøjer|Katalog|Samlere as three equal home tabs; paywalling Søg browse in this feature; showing a blocked peer in results; treating prototype A (grid-only) or B (mode tabs) as the locked home

**Søg catalog drill**:
A stamdata landing under Søg for Club, Kit, or Player only in this feature: identity chrome plus a grid of non-private UserJersey copies that match that grain. Kit means catalog shirt design (club · season · type), not one UserJersey. Kit drill lists only copies with `catalogKitId`. League, Season, and NationalTeam are not own landings yet — typeahead may filter the jersey home. Not Admin. Not Astro. Not own Samling.
_Avoid_: League/Season/NationalTeam landings in this feature; treating the drill as a KitPhoto gallery; serving archive bytes on the drill; conflating Kit drill with UserJersey detail; inventing an "unknown Kit" bucket for null catalogKitId

**UserJersey detail**:
Full-screen view of one UserJersey. Immersive photo stage (pager) with meta and actions in a bottom sheet — not hero+strip as the primary layout. **Own**: Privat and åben for bud switches, edit via Confirm UI (patch), delete. **Foreign**: owner → Peer Profil, Favorit, Send bud CTA when åben for bud (separate stack screen). Overflow Rapportér / Blokér. Not the Send bud form itself. Not a Søg catalog drill.
_Avoid_: Send bud as the only foreign view; price overlay on the photo; editing someone else's copy; a second edit form language beside Confirm; requiring an Indbakke thread before report/block; locking hero+strip after prototype B won

**Favorit**:
A saved foreign UserJersey — another collector's shirt on the Profil favorites grid. Not own Samling tiles. Not a Wishlist row.
_Avoid_: marketplace listing chrome; owner handle on the favorite tile; treating Favorit as Ønske

**Wishlist**:
A collector's structured want: catalog facets combined with AND. V1 facets are club, season, type (at least one set) and optional size. Not a saved UserJersey and not a Kit row. This increment's Entitlement gate is Wishlist CRUD plus match-job and match-push — not Søg or Send bud.
_Avoid_: Favorit as the want list; free-text wish; a Kit as the only shape; paywalling Indbakke in this increment; player or country facets in v1

**Ønske**:
The Wishlist place in Expo. This increment enters from the Samling header trailing Icon button, replacing the notification bell. The empty notification Sheet on that slot is gone. Not a tab. Not Indbakke. Favorit stays under Profil.
_Avoid_: a sixth tab; heart in slot 4; treating the header slot as Favoritter; keeping the empty notification Sheet as the header action

**Match**:
A hit when another collector's bidding-enabled, non-private UserJersey satisfies a Wishlist row's AND facets. OS push deep-links to that UserJersey. In-app the Wishlist row shows the hit. Aktivitet stays Bud. Own copies never match. Private copies never match.
_Avoid_: matching a closed copy; matching a private copy; matching a seed Kit with no UserJersey; matching the owner's own Save; a Match card on Aktivitet

**Offer**:
Admin-owned Billing catalog: which month and year IAP product ids are live, whether Nest-trial is on, and trial days. This increment includes a minimal Staff page for those fields. Display price comes from the store SDK. Admin does not set the kroner Apple or Google charge.
_Avoid_: a DKK price column as IAP truth; hardcoded SKUs in Nest; calling Offer a User.role

**Nest-trial**:
An Entitlement Nest writes with source `trial` for N days when Offer says trial is on and the collector has not used trial. Starts the first time they open Ønske or tap Tilføj without a live Entitlement. Otherwise that moment is the paywall (month/year + Restore). Not an App Store or Play introductory offer. Restore remains IAP.
_Avoid_: treating trial days as App Store Connect metadata; a second User.role for trial; requiring a UserJersey before trial; a separate “Prøv N dage” step as the only start

**Lapse**:
When Entitlement expires, Wishlist rows remain. Match-job and match-push stop. The collector can view and delete rows. Create and edit require a live Entitlement. Collection, Søg, and Send bud stay as they are.
_Avoid_: deleting Wishlist rows on expiry; locking view/delete behind the paywall; paywalling Samling

**Comp**:
An Entitlement Staff writes from Admin with source `comp` and an expires date. Support and demo accounts. Not Staff access and not an IAP receipt.
_Avoid_: granting paid Expo features via `User.role`; requiring sandbox IAP for every operator demo

**Match-push prompt**:
The OS push permission is asked when the collector saves their first Wishlist row. Not at register, not at first Ønske open, not after the first Match. Profil Notify prefs remain the in-app switches.
_Avoid_: a launch push wall; asking only after a Match was already missed

**Indbakke**:
The collector messages place in tab slot 4 (envelope). Beskeder and Aktivitet are two views of one conversation model. Not Ønske, not a general notification tray.
_Avoid_: heart / wishlist chrome in slot 4; a Match card on Aktivitet; using the Samling header for inbox unread

**Entitlement**:
Nest-owned Billing fact on a User: paid collector plan yes/no, expires, source (`iap_apple` / `iap_google` / `trial` / `comp`, later `stripe`). Orthogonal to Staff access. Absence is the free Collector. Not a `User.role` and not a plan column on User.
_Avoid_: stuffing the plan into `User.role`; treating `role=admin` as paid; Tier one/two/three before a second SKU; Expo or JWT as billing truth; calling the store chrome "Premium" a schema name; Admin DKK as the charge amount

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

**Draft**:
One Pi scaffold subagent after workpad `### Composition` and before Composer domain helpers. Pins free OpenRouter coding models (`minimax/minimax-m3:free`, then `z-ai/glm-5.2:free`, then paid Flash `deepseek/deepseek-v4-flash-0731` → `z-ai/glm-5.3-flash`) with Hy3 then Composer fallbacks (Laguna remains in the balanced free rotation as a paid free-chain step). Writes boilerplate under write-scope only (stubs, types, rote shells, Composition mirrors). Parent and nest/drizzle/expo/ui-ux/devops still own correctness, TDD green, and sensitive seams. Skip Draft on cheap/Spec/first-pass resume (with Skip Scout), when Model route says Skip Draft (critical), and when the slice is auth/IAP/Vision-only.
_Avoid_: Draft as `PI_MODEL`; Draft owning auth/IAP/Vision/secrets; replacing nest/expo/drizzle/ui-ux; skipping Composer helpers after Draft; treating free primary as hard-fail when rate-limited; omitting Hy3/Composer fallbacks

**Model route**:
Cheapest-capable routing across implement gates. Before spawn, a rule heuristic scores slice complexity (`simple` | `standard` | `critical`) from write-scope, helpers, path count, and critical keywords (auth/IAP/Vision/secrets/billing). Optional host env `HARNESS_MODEL_PROFILE` (`economy` | `balanced` | `premium`, default `balanced`) shifts aggressiveness: **balanced** sets parent `--model` to free/cheap rotation for simple only (critical + helpers stay Composer); **economy** is OpenRouter-only for every tier — never `cursor/composer-*` — with role pins: Scout/helpers/Slop → Hy3; Builder **simple** → DeepSeek Flash else Hy3; Optimizer → DeepSeek Flash; ui-ux → GLM 5.3 Flash (multimodal for optional design PNG spot-check); Draft keeps free primary with Flash then Hy3 fallbacks; factory-checker/land → Hy3. Temporary frontmatter pins restore after Pi. Gates: plan (Scout/Hy3) → scaffold (Draft free rotation) → implement (profile + tier) → verify (Hy3 then free/Flash rotation; Mechanical close stays harness-owned). Cheap rotation on 429: MiniMax M3 free → GLM 5.2 free → Laguna S 2.1 (`poolside/laguna-s-2.1`) → DeepSeek Flash → GLM 5.3 Flash → Hy3 → (balanced/premium: Composer; economy: MiMo). Route decisions + outcomes persist in SQLite `route_runs` for retro tuning (`token-report --routes`).
_Avoid_: prompt-only routing while parent stays Composer on simple; one model for every gate; stalling the stay on a single free 429; Draft as `PI_MODEL`; treating heuristic score as invoice truth; leaving Composer in an economy chain or helper pin

**Gate**:
Superseded by **Mechanical close**. Implement must not spawn the Gate Pi agent. Harness owns rebase, format apply, typecheck touched (yellow), and required GitHub wait after implement exits.
_Avoid_: spawning Gate; treating a Pi Gate report as the pass verdict; Linear CLI from Hy3 for pre-review

**Mechanical close**:
Harness-owned format apply, rebase-on-conflict, and GitHub wait after implement Pi exits. `pnpm format` / `biome check --write` runs in-process; a CONFLICTING PR during the wait is rebased in the same slot. Logic CI (anti-slop, typecheck, assertions) still cheap-retries Pi. UI implement appends a slice excerpt of `docs/design-system.md`, not the whole lock.
_Avoid_: a 30-minute wait on a dirty PR then a new try; dumping the full design lock into every helper; treating format CI as a Composer job

**First-pass pack**:
Ticket-derived slice brief (paths + Do not + prior fails + top Hermes lessons) and Scout `### Composition` paths. Full implement loop is Scout → Composition → Draft (once, free OpenRouter scaffold) → helpers one at a time; no Pi Gate. Checker tags registered classes `[first-pass:<id>]`. Same Standards/Slop class 2× → workpad requires land in `.pi/first-pass-classes.json`. Worker scan uses registry only. Incomplete checker `### Review feedback` (missing Spec/Standards/Slop axes) while the PR is green re-runs factory-checker in-slot (cap 2), then parks for human — never a full implement tree. Factory-checker gets a harness-injected review snapshot (capped issue description + three-dot diff); readonly `git` bash fills gaps only — no full `CONTEXT.md` dump, no `gh pr checks` poll in Pi. Spec-only checker fails use slim resume (Skip Scout/Draft/helpers). Pi spawns use `--no-context-files` (no AGENTS.md dump). Token runs log model/input/output/costUsd to harness JSON + workpad ring + `/health.tokenRuns` + durable SQLite (`KIT_TOKEN_DB_PATH`) keyed by identifier/issueId/sessionId (Cursor Composer/Grok list rates, OpenRouter free at $0, or reported usage cost).
_Avoid_: inventing product scanners in `first-pass.mjs`; treating every checker fail as a full Scout+Draft+helpers tree; bouncing incomplete workpads to Implementing; parallel helper fan-out; spawning Gate; checker rediscovering the whole diff via bash; reading full CONTEXT on every spawn; treating list-rate costUsd as invoice truth

**Hy3**:
OpenRouter model `tencent/hy3` for Scout (primary), no-think. Economy Builder (standard/critical), nest/expo/drizzle/devops/Slop, and factory-checker/land also pin Hy3. Gate (legacy pin) uses `xiaomi/mimo-v2.5-pro` as primary and Hy3 as first fallback. Scout falls back to MiMo-V2.5-Pro then DeepSeek Flash / Composer. Draft uses free OpenRouter coding models first, then DeepSeek Flash → GLM 5.3 Flash → Hy3, then Composer — not Hy3 as Draft primary. Economy Optimizer pins DeepSeek Flash; economy ui-ux pins GLM 5.3 Flash (native multimodal) for optional Read of at most two cited design PNGs — not a whole-app visual audit, not product Vision (jersey CV). Missing `OPENROUTER_API_KEY` fails those subagents closed (the implement job fails). Prefer OpenRouter Exacto when the client can set it; otherwise the default route to that model id is enough. Last fallback is `cursor/composer-2.5` — not Kimi, not Hy4. Domain helpers and Slop pin `cursor/composer-2.5` on disk; an omitted `model:` makes Pi use Kimi; economy rewrites pins for the stay.
_Avoid_: stealth/ox-alpha; Kimi as Scout/Gate/Draft fallback; omitting helper `model:`; free Draft models for nest/expo/drizzle ownership; Hy3 for planner; blocking the slice on Exacto; pinning Scout/Gate to Hy4 as the default; pinning Draft to a free model without Hy3/Composer fallback; economy factory-checker on Hy3 without `OPENROUTER_API_KEY`; ui-ux touring unrelated screens for “consistency”

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
A try is one Implementing stay that reaches In Review (local Gate clean, required GitHub checks green, PR open). Cheap in-slot format/CI re-spawns are not tries. `reviewLoops` increments when checker or land sends the issue **back** to Implementing. `ciFailCycles` is not incremented on in-slot CI retry. Either counter at five blocks Auto-merge. Counters live under workpad `### Loop counters`. Missing counters fail closed.
_Avoid_: counting cheap format/CI Pi re-spawns as tries; a retry-cap hold that skips resume; treating maxBuffer as format-red

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
