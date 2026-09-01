# Design system

AI-ready visual and interaction lock for in-scope surfaces.
Agents apply this file. Flag missing context; do not invent values, tokens, variants, or rules.

**Surfaces in scope**: `mobile` (deep), `web` (thin, share/OG), `admin` (operator dashboard). `api` is out of this lock.
**Modes**: Lock 2026-08-22. Gap 2026-08-23 (`admin`). Gap 2026-08-23 (`mobile` collection chrome + brand type). Gap 2026-08-23 (`mobile` Tilføj trøje Confirm — one screen, not Stamdata/Detaljer tabs). Gap 2026-08-24 (brand kit SVG files + admin header/login/favicon placement). Gap 2026-08-28 (`mobile` Indbakke — slot 4 envelope, Beskeder | Aktivitet, thread, send-bud). Gap 2026-08-28 (`mobile` own Profil — identity, favorites, settings under Profil, Switch, Avatar, log-out Sheet). Gap 2026-08-31 (`mobile` Søg magazine + catalog drills, UserJersey detail, Peer Profil — prototype C verdict). Light is the default canvas. Dark is a full token mode on `mobile` and `web` that follows the system appearance. `admin` is **light only** this gap — do not invent a dark admin canvas.
**Owner**: Nicklas

**Taste (locked)**: Vinted for layout and scanability (grid, short captions, search, chips, tab bar) — not for marketplace mechanics. Uber Base for grayscale structure, components, and quiet motion — not for copying UberMove or importing Base Web. One cyan→violet identity wash as garnish, Premier League Fantasy–adjacent, never as chrome that competes with a jersey photo. Søg home is a **magazine of shelves** (prototype C), not a single flat discover grid and not Trøjer|Katalog|Samlere home tabs.

**Taste (`admin`, locked this gap)**: Same Base grayscale family, operator density. Uber Base dashboard (top search, Filters, hairline table) is the north star — not Vinted’s collection grid, not Catalog peek, not Base Web as a dependency, not a “+ New” create affordance in this increment. Place switching is the waffle: two tiles, icon above title (**Master Data** | **User Data**), not underline tabs. Photos are evidence (32px square thumb in Kit and UserJersey rows, full image on drill), not the layout. Chrome in English (ADR-0019).

**Anti-references**: Shirt Squad field wizards; Vinted buy/sell/price/boost/teal CTA; newbie primary/secondary palettes; emoji as icons; archive `KitPhoto` JPEGs as club marks; Fantasy-style gradient fills behind product photos; 4:5 tile grid as the admin home.

## Goals

Status: `locked`

**Problem**: Collectors have no serious place to register and scan a football-shirt collection. Operators have Catalog peek without photos, users, or navigation. Implementing agents have no visual lock, so they invent taste. Collectors fail as slow capture and noisy chrome; operators fail as a spreadsheet the agent styled.

**Audience**: Nordic collectors (Denmark first, then Sweden and Norway) on `mobile` and `web`. Staff access on `admin`. Implementing agents composing Expo, Astro, and Admin SPA screens.

**Outcomes**: Jersey #2 in under 45 seconds. The collection scans as a photo grid, not a spreadsheet. A public Astro link looks like the same product when pasted into a Facebook group. On `admin`, an operator can search and filter stamdata, see KitPhoto, and take down one UserJersey without invented chrome. Missing decisions are flagged, not filled with taste.

**Evidence**: Product PRD (`.scratch/Business/PRD.md`) UX principles; registration-speed research (`.scratch/Research/jersey-registration-speed.md`); lock interview (Vinted IA + Base grayscale + one wash); Gap 2026-08-23 (Uber Base dashboard refs + grill: Staff access, Take-down, ADR-0018, ADR-0019); Gap 2026-08-23 brand book v1.0 (`.scratch/collection-main-screen/claude-design/KitCollective-brand-book-v1.html`) for type families and scale; collection 3a artifact for Samling chrome (`.scratch/collection-main-screen/claude-design/KitCollective-samling-og-genveje-3a.html`); Gap 2026-08-23 Tilføj trøje hi-fi (`.scratch/jersey-upload/claude-design/`) for capture spine only — Confirm body is this file, not the Stamdata/Detaljer tabs in that artifact; Gap 2026-08-28 Indbakke hi-fi (`.scratch/inbox/claude-design/KitCollective-indbakke.html`, frames 4a–4i) for inbox chrome only — throwaway `apps/mobile/src/prototype-inbox/` is not the contract; Gap 2026-08-28 own Profil hi-fi (`.scratch/profile-settings/claude-design/KitCollective-profil.html`, frames 5a–5o) for own-collector Profil chrome only — throwaway `apps/mobile/src/prototype-profile/` is not the contract. Wireframe PNGs in that folder are IA only. Gap 2026-08-31 Søg magazine verdict: `.scratch/soeg-browse/prototype/verdict.md` + `KitCollective-soeg-home.html` (variant C). UserJersey detail: `verdict-detail.md` + `KitCollective-jersey-detail.html` (variant B immersive). Peer Profil: `verdict-peer.md` + `KitCollective-peer-profil.html` (variant A). **Hi-fi evidence:** `.scratch/soeg-browse/claude-design/KitCollective-soeg-og-troejer.html` (frames 6a–6d) — throwaway prototype HTML is not the host API; hi-fi is visual reference only. ADR-0035 (Søg browse stays free).

**Priorities**: On `mobile` / `web`: owned photo and capture speed over catalog completeness. On `admin`: scannable rows over photo-as-layout. All surfaces: grayscale chrome over a mascot brand hue. Data marks over decoration.

**Constraints**: No archive kit renders in Expo, Astro, or OG until rights are resolved. KitPhoto may render on `admin` only. No emoji as illustration. Clients do not import `apps/api` or `packages/db`. `mobile` / `web` copy is Danish-first; `admin` chrome is English; CatalogLabel follows the surface locale (`da` on Expo/Astro, `en` on admin), never the English seed string as the Danish name. Hit targets ≥ 44×44 on `mobile`. On `admin`: table row 48px; icon actions 32×32 with an accessible name; toolbar primary/destructive 44×44. WCAG AA for text and essential controls. `prefers-reduced-motion` has a still equivalent. `admin` is light only.

**Non-goals**: A component library for its own sake. Cloning Uber or Vinted branding. Importing Base Web. Price, buy/sell, or marketplace listing UI. Serving `KitPhoto` to collectors. A “+ New” catalog-create control in this admin increment. Inventing a second mark or a mascot. Danish chrome as the admin default.

Flag missing context; do not invent priorities.

## Principles

Status: `locked`

**Jersey first**: The collector’s photo is the interface; chrome is grayscale scaffolding.
- **When it collides**: On `mobile` and `web`, identity wash, badges, and metadata yield to the photo. On `admin`, this principle yields to **Rows first**.
- **Follow**: A collection card where the jersey fills the tile; club is `heading-sm`, season · type is `mono` under it.
- **Violate**: A Fantasy-style gradient fill behind the jersey photo.
- **Goal it serves**: Scanable collection; photo as product image.

**Fast capture**: One confirm screen beats a complete wizard.
- **When it collides**: Extra fields yield to time-to-Save. A cleaner-looking second tab yields if it hides a field Save requires.
- **Follow**: Club search, club-scoped season, chips for type / size / condition on the same screen as **Gem**; nameset, player, patches, purchase, and authenticity behind “Flere detaljer”. Save does not wait on Vision.
- **Violate**: Stamdata | Detaljer tabs on Confirm. A Shirt Squad–style twelve-step form before the row exists. Star ratings for condition. A “Brug” tap on every high-confidence Vision hit.
- **Goal it serves**: Jersey #2 in under 45 seconds.

**Structure without a mascot color**: Black, white, and gray carry hierarchy. One identity wash is garnish only.
- **When it collides**: “Make it more branded” yields to grayscale UI. Gradients never encode status or fill a primary CTA.
- **Follow**: Primary **Save** is black on light / white on dark.
- **Violate**: A cyan primary button, or three washes used as success / warning / info.
- **Goal it serves**: Quiet, Base-like structure; identity without a newbie palette.

**Marks from data**: Country / league / club / player use a licensed mark when one exists; otherwise a monogram. Never emoji.
- **When it collides**: An empty slot stays a monogram. Agents flag missing assets; they do not invent crests.
- **Follow**: A club row with a crest or the letters from `CatalogLabel` on a gray tile.
- **Violate**: ⚽, a made-up shield, or an archive kit JPEG used as a club logo.
- **Goal it serves**: Catalog truth in the UI; no decoration pretending to be stamdata.

**Rows first** (`admin` only): The table is the interface; photos are evidence.
- **When it collides**: Jersey first yields on `admin`. 4:5 collection layout does not come across. A missing thumb is an empty 32px slot, not an invented crest and not a stretched archive JPEG as a club mark.
- **Follow**: A Kit or UserJersey row with primary label, meta columns, and a 32px square thumb; full photo on drill.
- **Violate**: Admin home as a two-column 4:5 grid of archive `KitPhoto` tiles.
- **Goal it serves**: Operator can scan stamdata and collectors without invented dashboard chrome.

Flag missing context; do not invent new rules.

## Scope

Status: `locked`

**Included** (surface → depth):
- `mobile` (Expo, iOS/Android): collection grid, empty state, add / confirm / Save, gallery-first onboarding and camera-on-repeat, **Søg** as magazine home (shelves + typeahead) with Club / Kit / Player catalog drills and Peer Profil / UserJersey detail under the compass stack, genveje chips + Tilpas (Sheet manager, not a tab), Indbakke (Beskeder | Aktivitet, conversation, Detaljer → Peer Profil, empty), Send bud from foreign UserJersey detail (under Søg), own Profil (identity card, unique username, About me, location country → city search / popular / free tag, favorites as other collectors’ UserJerseys, settings hub, cookies, log out), floating icon-only tab bar (Samling · Søg · Tilføj trøje · Indbakke · Profil).
- `web` (Astro): public collection page, single UserJersey page, Open Graph image and title — same tokens so a shared link is recognisably KitCollective. Thin: no login mutations, no capture UI.
- `admin` (Vite + React SPA): email/password login (same Identity); waffle places **Master Data** | **User Data** (routes `/stamdata`, `/collectors`); search + Filters Chip; hairline data table; 32px square thumb on Kit and UserJersey rows; Mark/monogram on club, season, and user identity rows; row drill; Take-down confirm; promote/demote with last-admin and self-demote guards. English chrome. Light only. KitPhoto may render here.

**Excluded** (with reason):
- `api` and catalog peek (`GET /v1/catalog/peek`): unstyled Nest HTML, not product UI (ADR-0016). Peek is not retired by this gap.
- Marketplace listing chrome (price, buy, boost, ratings on cards): product is a catalog, not Vinted-the-marketplace. Bid amounts live in Indbakke / Send bud, never as overlay on a Samling tile or on Søg “Flere trøjer” tiles. Own Profil does not host “my listings”, payments, postage, help, about, or legal as primary places.
- Collector **gender** as a profile field: nothing in the product uses it this gap. Birthday stays.
- Archive `KitPhoto` bytes on Expo, Astro, or OG: `admin_only` until rights are resolved.
- Emoji as icons or category marks.
- Importing Base Web. Cloning Michelangelo Studio as a full product (sidebar, “+ New”, metric table pills). Admin header cluster (search + pin + notifications + help + waffle + profile) is owner-directed from Michelangelo Studio this gap.
- Bulk row actions and a “+ New” catalog-create control.
- Zebra-striped tables. 4:5 collection grid as the admin home.
- Søg home as **Trøjer | Katalog | Samlere** equal tabs (prototype B) or grid-only + overlay as the locked home (prototype A) — magazine (prototype C) won.

**Deferred** (with reason):
- `admin` dark mode: this gap is light only; flag, do not invent.
- Scoped staff roles UI (moderator who cannot see everything).
- Catalog writes (labels, Kit create/edit, `rights: public`).
- Players as a primary admin table (squad stays count + expand on club–season).
- Ønske **content** (list, filters) and IAP paywall chrome beyond what Wishlist already shipped — flag paywall title words; do not invent wishlist-row primitives.
- League / Season / NationalTeam as **own** Søg catalog landings (typeahead may filter the magazine; no dedicated drill this gap).
- Android-specific Message composer chrome (Material field / FAB send). One composer contract; OS keyboard is the platform exception.
- Expo Web as a first-class surface. Indbakke wide layout (4i) is the token/layout rule if a host is ≥1024 wide; it does not make Expo Web first-class.
- KC mark on **Profil** header (not locked; flag, do not invent).
- Identity wash variants 2 and 3: no named job yet.
- Player portraits, league badges, and club crests as shipped artwork: UI slot is locked; assets are not.

Flag missing context; do not expand scope.

## Architecture

Status: `locked`

**Layers**: foundations → tokens → components → patterns.

**Naming**: Purpose-encoded. Semantic tokens in UI (`color.content.primary`, `space.inset.md`). Primitives (`gray.0`, `gray.100`) only inside token files. Do not name tokens after hex or after Uber/Vinted.

**Source of truth** per decision type:
- What a thing *is* (Kit, UserJersey, CatalogLabel, Save): `CONTEXT.md`.
- Visual and interaction rules: this file.
- Machine-readable tokens for agents that look for Google Labs `DESIGN.md`: repo-root `DESIGN.md` (YAML front matter). Same values as this file; **this file wins** on conflict.
- Why a hard-to-reverse product trade-off exists: `docs/adr/`.
- Uber Base and Vinted: references for taste, not dependencies and not copy-paste APIs.

**Placement rule**: A new visual decision lands in the lowest layer that can express it. A one-off screen color is a missing token — flag it. A new button look is a missing component variant — flag it. Admin-only density and page regions live under Foundations → Layout / Spacing as surface-specific usage, not a second design system and not a new layer. Do not add a layer.

Flag missing context; do not invent layers.

## Ownership

Status: `locked`

**Visual direction**: Nicklas (including Admin SPA).
**Tokens / foundations**: Nicklas.
**Components**: Nicklas (new primitives and variants).
**Review / escalation**: Agents apply this file and flag gaps. Unresolved visual disagreement goes to Nicklas, not a new principle in a PR. Admin dark mode and “+ New” are out of this gap — flag them; do not invent. Admin Data table zebra follows Base Data Table (`fill.secondary` / `surface`).

Route requests. Do not assign authority.

## Foundations

### Color

Status: `locked`

**Purpose**: Grayscale structure so jersey photos dominate. Status color is functional. Identity wash is garnish, not a brand primary.

**Roles**:
| Role | Meaning |
| --- | --- |
| `canvas` | App/page background |
| `surface` | Cards, fields, sheets |
| `surface.raised` | Overlay sheet sitting on a scrim |
| `content.primary` | Titles, primary labels, primary icon |
| `content.secondary` | Captions, helper text |
| `content.muted` | Placeholder, de-emphasized meta |
| `content.inverse` | Text on primary fill or on dark photo scrims |
| `border.subtle` | Card edge, input outline |
| `border.strong` | High-emphasis hairline (selected card, if a line is used) |
| `fill.primary` | Primary button fill (black on light, white on dark) |
| `fill.secondary` | Secondary / quiet fill |
| `danger` | Destructive or invalid. Never the only error signal |
| `warning` | Caution that is not data-loss |
| `success` | Completed, saved, matched |
| `info` | Neutral system notice (not the identity wash) |
| `identity.wash` | Single cyan→violet gradient garnish |
| `scrim` | Dim behind sheets |

**Usage**: Select semantic roles in UI. Primary actions use `fill.primary`, never `identity.wash`. Selected chips use `fill.primary` / inverse content or a strong border — not a wash. Vision suggestions use existing surface + content roles; do not invent a “AI purple”.

**Relationships**: Elevation uses `surface` / `surface.raised` plus scrim, not a random lighter hex. Focus uses the border/focus foundation, not the wash.

**Constraints**: Text and essential controls meet WCAG AA against their surface. Color is never the only error or selected signal. `identity.wash` is forbidden: behind a jersey photo, on body text, on a primary CTA, as success/warning/danger/info. Wash variants 2 and 3 are deferred. `admin` uses the **light** aliases only — do not apply dark semantic aliases on that surface. Own Profil dark (hi-fi 5o) uses **these** dark aliases — do not copy the artifact hex `#0B0B0B` / `#1C1C1C` / `#2E2E2E` as new tokens.

**Example** *(not a rule)*: Collection screen `canvas`; jersey tile `surface` with photo full-bleed inside the radius; caption `content.secondary`; **Save** `fill.primary`. Admin table: Base Data Table zebra (`fill.secondary` / `surface`); hover is one shade darker (`border.subtle` on a gray row, `fill.secondary` on a white row). Not `identity.wash`.

**Exceptions**: Photo pixels are not tokens. A user JPEG may be any color; chrome around it stays grayscale.

**Primitive values** (light):
| Primitive | Value |
| --- | --- |
| `black` | `#000000` |
| `gray.0` | `#FFFFFF` |
| `gray.50` | `#F4F4F4` |
| `gray.100` | `#E8E8E8` |
| `gray.400` | `#6B6B6B` |
| `gray.600` | `#5E5E5E` |
| `gray.900` | `#000000` |
| `danger.500` | `#B42318` |
| `warning.500` | `#F5A623` |
| `success.500` | `#0E8345` |
| `info.500` | `#276EF1` |
| `identity.wash.start` | `#00D4F5` |
| `identity.wash.end` | `#6B2FFF` |

**Semantic aliases (light)**: `canvas` → `gray.0`; `surface` → `gray.0`; `surface.raised` → `gray.0`; `content.primary` → `black`; `content.secondary` → `gray.600`; `content.muted` → `gray.400`; `content.inverse` → `gray.0`; `border.subtle` → `gray.100`; `border.strong` → `gray.900`; `fill.primary` → `black`; `fill.secondary` → `gray.50`; `scrim` → `black` at 40% opacity.

**Semantic aliases (dark)**: `canvas` → `gray.900`; `surface` → `#1A1A1A`; `surface.raised` → `#2A2A2A`; `content.primary` → `gray.0`; `content.secondary` → `#C2C2C2`; `content.muted` → `#8A8A8A`; `content.inverse` → `gray.900`; `border.subtle` → `#333333`; `border.strong` → `gray.0`; `fill.primary` → `gray.0`; `fill.secondary` → `#2A2A2A`; `scrim` → `gray.900` at 60% opacity. Status primitives stay the same hues; check AA on the dark surface and flag if a control fails.

`identity.wash`: linear gradient `start` → `end`, used at low opacity (about 12–24% fill) or as a thin (2px) rule / header strip. Never opaque full-bleed on a content card that holds a jersey photo.

Flag missing context; do not invent values, tokens, variants, or rules.

### Radius

Status: `locked`

**Purpose**: Two families so surfaces feel like Base cards and actions feel tappable, without rounding the jersey into a pill.

**Scale**:
| Token | Value | Use |
| --- | --- | --- |
| `radius.xs` | 4px | Tiny nested tags only |
| `radius.sm` | 8px | Buttons; nested surfaces inside a card |
| `radius.md` | 12px | Default cards, photo tiles, banners |
| `radius.lg` | 16px | Sheets, dialogs, large containers |
| `radius.pill` | 999px | Chips, search field |

**Usage**: Photo tiles and collection cards use `radius.md`, not pill. Buttons use `radius.sm` (rectangular 8px), not pill. Chips and search use `radius.pill`. Nested child radius shrinks one step (card `md` → nested `sm`). Admin table thumbs use `radius.sm` (32×32), not `radius.md` and not pill.

**Relationships**: Layout clips the photo to the tile radius. Border follows the same radius.

**Constraints**: Do not use 0px on interactive elements. Do not put `radius.pill` on a jersey photo tile.

**Example** *(not a rule)*: A collection tile at `radius.md` containing a full-bleed photo; a dock **Save** button at `radius.sm`.

**Exceptions**: System sheets may use the platform’s own top-corner radius. Match `radius.lg` when we draw the sheet ourselves.

Flag missing context; do not invent values, tokens, variants, or rules.

### Motion

Status: `locked`

**Purpose**: Quiet confirmation that something happened. Never celebration, never decoration.

**Scale** (Base-adjacent):
| Token | Duration | Use |
| --- | --- | --- |
| `motion.fast` | 200ms | Pressed/hover color, chip select |
| `motion.base` | 300ms | Sheet present, tab content fade |
| `motion.slow` | 400ms | Rare: large contextual reveal (empty → first tile) |
| Easing | `cubic-bezier(0.4, 0, 0.2, 1)` | Default in/out |

**Usage**: Animate opacity and transform only. Moments that earn motion: shutter feedback, sheet present/dismiss, Vision suggestion fade-in, tab change. No bounce, no confetti, no auto-playing loops on load except a loading indicator.

**Relationships**: Reduced-motion still states use the same layouts at rest.

**Constraints**: `prefers-reduced-motion: reduce` → durations ~0 / no transform travel. Shutter may keep a one-frame highlight. Loading indicators may remain if they are the only progress signal.

**Example** *(not a rule)*: Confirm sheet slides up in `motion.base`; Vision chips fade in with `motion.fast` when the suggestion arrives.

**Exceptions**: Platform keyboard and system share sheets use OS motion.

Flag missing context; do not invent values, tokens, variants, or rules.

### Layout

Status: `locked` (Gap 2026-08-23: collection home regions = 3a. Gap 2026-08-28: Indbakke regions = 4a–4i. Gap 2026-08-28: own Profil regions = 5a–5o. Gap 2026-08-31: Søg magazine + catalog drill + UserJersey detail + Peer Profil). Chip row = genveje (Chip / Collection shortcuts). Brand-book Hjemme/Ude on Samling is **not** layout.

**Purpose**: A Vinted-like scan of owned jerseys on `mobile` / `web`. Add is capture, not a listing. Public web is the same product at read-only depth. `admin` is a Base dashboard: table, search, filters; photos are evidence, not the layout. Indbakke is collector-to-collector messages on `mobile`, not a marketplace inbox.

**Regions (mobile)**:
| Region | Meaning |
| --- | --- |
| Screen | Full viewport plus safe-area insets |
| Header | Collection home: title **Samling** (`display` 28) + count (`mono`) + trailing Icon button (Ønske bookmark when that feature is live — not an empty notification Sheet). No search, no profile, no wordmark, no KC mark. Indbakke list: title **Indbakke** (`title` 24) only — no bell. Conversation: back + handle (`heading-sm`) + optional jersey context (`mono`) + overflow. Detaljer / Send bud / own-Profil drills / Peer Profil / UserJersey detail / Søg catalog drill: back + `title`. Own Profil **home** and **Søg home**: title (`title` 24) only — no KC mark, no bell. Søg home may show a quiet `mono` count only if the host has one job for it — flag; do not invent a second header control |
| Body | Collection grid or confirm form. Chip row **under** the header when the collection is not empty (Collection shortcuts). Grid scrolls; last rows must clear the floating tab bar. Indbakke: underline tabs then Thread row list, Activity cards, or Empty state `inbox`. Conversation: message column (dates, Bid cards, Chat bubbles) then Message composer. Detaljer, own Profil, and Peer Profil: grouped lists on `fill.secondary` canvas; groups on `surface`, `radius.md`, hairline `border.subtle` between rows. **Søg home**: Search field then magazine shelves (see Pattern Søg). **Søg typeahead**: replaces magazine body with sectioned List rows (+ optional jersey grid). **Søg catalog drill** / **UserJersey detail**: see Patterns |
| Footer actions | Primary/secondary buttons for the current task; pinned **Button dock** at the bottom on login, register, confirm, empty collection, and Cookie-indstillinger. Conversation uses Message composer, not Button dock. Send bud uses an in-body `primary` (not a dock). Own Profil home and Søg home have no dock — last content clears the Tab bar. Foreign UserJersey detail pins **Send bud** inside the immersive bottom sheet when åben for bud — not a separate Button dock |
| Tab bar | Floating glass pill **above** the home indicator / safe-area inset. Five icon-only slots (Tab bar). Content may show through behind it. Not a full-width labeled dock |

**Usage (mobile)**: Collection body is a **two-column** photo grid on phone. Jersey photos on tiles are cropped **4:5**. Caption under the photo: club (`heading-sm`) then season · type (`mono`). **Search is not in the collection header** — it is the Søg place (compass slot). Collection chips are **genveje**, not kit type (kit type stays on Confirm). **Tilføj trøje** (raised plus) opens the photo flow (gallery-first on first session, camera-first on repeat), not the overview, not “new shortcut”, and not a marketplace compose screen. “Same club” vs “New jersey” is a choice after Save, not inherited identity on **New**. Other collector screens (Søg, Indbakke, Profil, Detaljer, Send bud, Peer Profil, UserJersey detail, catalog drills) use `title` 24 in the header unless a later lock says otherwise. Conversation header is the other collector’s handle, not `title`. Genveje manager is a **Sheet**, not a titled full-screen place.

**Indbakke (phone)**: Two underline tabs **Beskeder** | **Aktivitet** (Top tabs anatomy, Danish labels). One conversation model behind both — unread is shared. Hide the Tab bar on Samtale and Detaljer (same hide rule as capture). Show it on the Indbakke list (including empty) and on Send bud. Send bud is a Søg-stack screen: compass slot is the active place, not envelope.

**Søg (phone)**: Title **Søg**. Search field under the header. No-query body is the **magazine** (Pattern Søg). Query replaces that body with typeahead sections. Catalog drills and foreign detail live under the Søg stack. Compass stays the active Tab bar place on Søg home, typeahead, catalog drill, and Send bud.

**Own Profil (phone)**: Canvas `fill.secondary`. Home shows the Tab bar (person slot selected). Every drill off home hides it (Pattern: Own Profil). Grouped lists match Detaljer: `surface` groups, `radius.md`, hairline rows. Identity card is a `surface` group, not a List row.

**Peer Profil (phone)**: Same canvas and identity-card anatomy as own Profil home, without Rediger / Indstillinger / cookies. Jersey listing under the card. Tab bar **hidden** (drill). Overflow Rapportér / Blokér.

**Indbakke (wide, ≥1024)**: Same tokens. Left column ~360px = list + Beskeder | Aktivitet. Remaining width = conversation. Selected Thread row: `fill.secondary` plus a 2px `fill.primary` leading edge. Not a new desktop product. Expo Web remains deferred as a first-class surface — apply this only when a host actually presents Indbakke at that width.

**Usage (web)**:
| Surface | Rule |
| --- | --- |
| Single UserJersey | Centered column, max-width **640px** |
| Collection | Centered column, max-width **960px** |
| Collection columns | 2 below 768px; 3 from 768px; 4 from 1024px; never more than 4 |
| Open Graph | Canvas **1200×630**. User photo dominates. Club + season as text. Compact wordmark or KC mark allowed with the wash strip (Logo). `identity.wash` only as a thin top strip, never behind the jersey |

**Regions (admin)**:
| Region | Meaning |
| --- | --- |
| App header | Wordmark left (`kitcollective-wordmark-black.svg`, min 96px wide). Search field fills the remaining width between the wordmark and trailing actions (leading search icon, 48px tall pill — not a 28rem cap). Trailing Icon buttons 44×44: pin, notifications, help, waffle (places). Profile action: 32px circular monogram from the operator email + chevron; menu is email + Sign out — not the KC monogram. Pin / notifications / help are chrome-only this gap (empty menus; no pin API, no inbox, no help center). Header row 64px. No “+ New”. No Sign out as a text Button in the header. No lockup in the header (lockup is login). |
| Waffle places | Two tiles, icon above title: Master Data \| User Data. Routes stay `/stamdata` and `/collectors`. |
| Toolbar | Entity chips in one Chip group. Master Data: Clubs, Seasons, Club seasons, Kits + Filters Chip. User Data: Users, Jerseys. Record count as `caption`. Search lives in the app header, not here. |
| Body | Data table, full remaining width |
| Drill | Full page replacing the table, with back |
| Confirm | Sheet/dialog over the drill (Take-down, demote) |
| Login | Centered `surface` card, max-width **400px**. Lockup (`kitcollective-lockup-black.svg`, min 132px wide) above the Sign in heading. Not the wordmark (wordmark is app header). Not white variants (`admin` is light only). |

**Usage (admin)**: Desktop-first. Page inset `space.inset.lg` (24px). Content is **full width** of the viewport minus inset — not the Astro 960px column. Table row height **48px**. Hairline row dividers (`border.subtle`). Rows use Base Data Table zebra: odd rows `fill.secondary`, even rows `surface`. Hover is one shade darker (`border.subtle` on a gray row, `fill.secondary` on a white row). Selected/focus also use that darker fill plus `border.focus`. Kit and UserJersey rows include a **32×32** square thumb (`radius.sm`); missing photo = empty 32px slot, not a crest invented from `KitPhoto`. Club, season, and user identity rows use Mark/monogram, not a KitPhoto thumb. Click row → full-page drill with back. Take-down and demote confirm in a Sheet (`confirm`) over that page. Below **1024px**: table scrolls horizontally; do not invent a phone admin layout. No split-view detail pane. No bulk checkboxes.

**Relationships**: Grid gap is `space.gap.md`. Page inset is `space.inset.md` on `mobile` / `web` and `space.inset.lg` on `admin`. Cards use `radius.md` and `surface`. Type roles from Typography. Logo placement from Logo. Admin table cells use `type.body` for header and cells (header is the same size, bolder). Meta and season/ID cells stay `body` size in `mono` or `content.secondary`. Floating tab bar is chrome on canvas (Elevation), not `elevation.overlay`.

**Constraints**: No price, buy, boost, or ratings on a collection card. Bid amounts belong on Activity card, Bid card, and Send bud only. No teal (or wash) primary in the tab bar. Tab bar Add is capture, never “new shortcut”. Safe-area insets are required on `mobile`. Body must reserve space for the pill + inset so tiles are not hidden — do not invent a named pixel token for that reserve; flag if a host needs a named constant. Content must reflow; do not hard-code a pixel width for the **mobile** grid (columns are 2, tiles flex). Do not invent a fifth desktop column. Do not invent an admin split-view, “+ New”, or a 4:5 admin home. Brand-book mocks with a wordmark **collection** header or labeled flush tabs are **not** Samling layout. `admin` header uses wordmark-black (Logo).

**Example** *(not a rule)*: iPhone Samling: “Samling” + “8” + bell; two 4:5 tiles per row; glass pill overlapping the bottom of the grid. Astro collection at 800px viewport shows two columns inside 960px. Admin Stamdata at 1280px: full-width table of kits with 32px thumbs, Filters in the toolbar, click a row to a drill page.

**Exceptions**: Confirm/Save is a single column. Camera session is full-bleed preview with three slots overlaid, not a grid. Capture does not crop while shooting. OG letterboxes a 4:5 photo on 1200×630 — do not crop the jersey to 16:9. Admin login is a centered 400px card, not full-width. Public Astro has no floating tab bar. Own-Profil drills have no Tab bar (home does).

Flag missing context; do not invent values, tokens, variants, or rules.

### Typography

Status: `locked` (Gap 2026-08-23: brand families). Do not take chips or labeled tabs from the brand book’s in-book app mocks.

**Purpose**: Product type, not system UI. Headings carry the KitCollective voice; body stays readable and secondary to the jersey photo. No UberMove.

**Families** (load as webfonts on `mobile`, `web`, and `admin`; system-ui is fallback only):
| Job | Family | Weights |
| --- | --- | --- |
| Headings and logo | **Archivo** | 400 (wordmark “Kit” only), 600 (UI headings), 700 (KC mark) |
| Body, labels, buttons | **IBM Plex Sans** | 400, 500 |
| Season, size, IDs, counts | **IBM Plex Mono** | 400, 500 |

Do not mix a heading role onto Plex Sans. Do not set body copy in Archivo. Do not use Mono for paragraphs.

**Roles**:
| Role | Family | Size | Weight | Line-height | Tracking | Use |
| --- | --- | --- | --- | --- | --- | --- |
| `display` | Archivo | **32px** (default); **28px** on collection home “Samling” | 600 | 37px (32); 34px (28) | −3% | Rare large heading; collection home title |
| `title` | Archivo | 24px | 600 | 29px | −2% | Other screen titles (Søg, Indbakke, Detaljer, Send bud, Profil, Peer Profil, Genveje, Ny genvej, catalog drills, UserJersey detail) |
| `section` | Archivo | 20px | 600 | 25px | −2% | Mid headings (picker title if not using `title`; empty-state title) |
| `heading-sm` | Archivo | 15px | 600 | 20px | −2% | Club name on a Jersey tile; collector handle on Thread row, conversation header, Peer Profil, and Detaljer entry row |
| `body` | IBM Plex Sans | 16px | 400 | 25px | 0 | Paragraphs, empty-state body, helper copy, Chat bubble text, thread snippet (one line, truncate) |
| `label` | IBM Plex Sans | 13px–16px | 500 | 18px (13) / 20px (16) | 0–0.01em | Buttons (16), chips (14), field labels (13) |
| `caption` | IBM Plex Sans | 12px–13px | 400 | 18px | 0 | Non-data meta (not admin table headers) |
| `mono` | IBM Plex Mono | 12px–14px | 400 | 18px (12) / 20px (14) | 0 | Season, kit type, size, collection count, IDs, relative time on Thread row and bubbles |

There is no extra 14px admin-only family. Admin uses the same roles; chrome in English.

**Usage**: One role per line of UI text. Collection tile is **two lines**: `heading-sm` club, then `mono` season · type. Do not join club and season into one `caption` string. Do not use `caption` as a button label. Do not use `display`/`title` inside a tile. On `admin`, table headers and cells share `body` size; headers use `label` weight (500). Season/ID/count cells use `mono` at that size. Bid **amount** on Activity card, Bid card, and Send bud field uses `mono` at **20px** / 24 line-height — not a new family, not Archivo, not a marketplace overlay on a tile.

**Relationships**: Title + supporting line stacks use `space.gap.sm`. Count beside “Samling” is `mono` 13px, muted. Label sits in buttons/chips with `space.inset` from Spacing. Wordmark and KC mark construction lives in the brand book; **where they appear** is Foundations → Logo.

**Constraints**: Body is at least 16px on `mobile` (`body`). Body and label follow Dynamic Type / font scaling; display/title/heading-sm may scale but must not blow the tab bar or two-column grid. Text is never the only state signal. WCAG AA against the surface. Brand book accent `#1F5EFF` is **not** a type color and is **not** this gap’s primary CTA — primary fill stays black.

**Example** *(not a rule)*: Collection home: Archivo `display` 28 “Samling” + Plex Mono “8”. Tile: Archivo `heading-sm` “F.C. København”; Mono “2023/24 · Hjemme”. Empty state title: `section`. Form helper: `body` or `caption`.

**Exceptions**: Legal / App Store fine print may use `caption`. System share sheets use OS type. If a webfont fails to load, fall back to system-ui with the same sizes — do not invent a fourth family.

**Source**: Brand book v1.0 §06. In-book app mocks that still show kit-type chips or a wordmark collection header are **not** type or layout rules.

Flag missing context; do not invent values, tokens, variants, or rules.

### Logo

Status: `locked` (Gap 2026-08-24: kit files + placements). Construction is brand kit v1.0 (`kitcollective-*.svg`). Do not invent a stacked variant, a compact file, a second mark, or a mascot. Do not rename kit files.

**Purpose**: Recognise KitCollective on entry, share, and system chrome. Collection scanning stays jersey-first — the product name in the Samling header is the screen title, not the brand lockup. Catalog **Mark** (club/season crest or letter monogram) is stamdata, not this logo.

**Files** (kit names; black = `#0A0A0A` on light, white = `#FFFFFF` on dark):
| File | Role | Use |
| --- | --- | --- |
| `kitcollective-lockup-black.svg` | Lockup (KC plate + wordmark). Primary. | Login, onboarding, splash on a **light** canvas. Min 132px wide. |
| `kitcollective-lockup-white.svg` | Lockup on dark | Same jobs on a **dark** canvas (`mobile` / `web` only). Never on `admin`. |
| `kitcollective-wordmark-black.svg` | Wordmark (name only) | App header, navigation, narrow chrome on **light**. `admin` header. Min 96px wide. OG wash strip when a wordmark is needed — same file at chrome size; there is no separate compact file. |
| `kitcollective-wordmark-white.svg` | Wordmark on dark | Same jobs on **dark**. Never on `admin`. |
| `kitcollective-monogram-black.svg` | Filled KC plate. Default square mark. | Favicon, avatar, stamp on light. OG when a square mark fits. |
| `kitcollective-monogram-white.svg` | Filled KC plate on dark | Same on dark. Never on `admin`. |
| `kitcollective-monogram-outline.svg` | Outline KC plate | Light surfaces only, when filled is too heavy. Not used on `admin` this gap. |
| `kitcollective-favicon.svg` | Favicon (filled black plate) | Browser tab icon. `admin`: `/assets/kitcollective-favicon.svg`. |
| `kitcollective-appicon-ios-dark.svg` | iOS app icon (standard) | Home screen / App Store dark. |
| `kitcollective-appicon-ios-light.svg` | iOS app icon (light/tinted) | iOS light / tinted appearance. |
| `kitcollective-appicon-android-round.svg` | Android round | Adaptive / round Play icon. |

**Hosts**: `apps/admin/public/assets/` (admin). `apps/mobile/assets/brand/` (Expo). `apps/web` does not exist this gap — do not invent a fourth brand package.

**Usage**:
- `admin` header: **wordmark-black**. Not lockup. Not the string “KitCollective Admin”.
- `admin` login: **lockup-black** above Sign in. Not wordmark.
- `admin` favicon: **favicon**.
- `admin` operator profile: circular letters from the operator **email**, not the KC monogram.
- Club / season / user identity rows: catalog **Mark** / letter monogram from stamdata. Never the product logo. Never emoji. Never `KitPhoto` as a crest.
- Collector Samling header: **Samling + count + notification** — no wordmark, no KC monogram, no lockup. Tab bar has no logo. Jersey tiles have no logo.
- Splash / onboarding / mobile login (when wired): lockup; black on light canvas, white on dark.
- Share / Open Graph: jersey dominates; wordmark or filled monogram in the wash strip only.
- Store / home-screen icons: appicon files. Kit README also names `store-square`; that file is **not** in the SVG kit — flag; do not invent it.
- Primary CTA fill stays black, never a logo color. Brand-book in-book mocks with a wordmark **collection** header are **not** a Samling placement rule.

**Relationships**: Type families from Typography (Archivo 400/600/700). Identity wash may sit as a thin OG top strip with the wordmark or monogram; wash never behind the jersey photo. Catalog **Mark** is the Mark component, not Logo.

**Constraints**: Colour is `#0A0A0A` or `#FFFFFF` only — never grey, never `#1F5EFF`, never wash. Clear-space: half the plate height on every side. Do not stretch, rotate, add shadow, or place the logo on a busy jersey photo without a dark layer. Contrast AA on canvas. `admin` is light only — **do not use white wordmark, white lockup, or white monogram there**. Do not mix product logo and catalog Mark. SVG text is live Archivo; inline the mark on HTML so the page webfont applies (`<img>` will fall back to system sans).

**Example** *(not a rule)*: Admin header: wordmark-black at 20px height. Admin login: lockup-black at ~220px wide above “Sign in”. Collection home: “Samling” `display` 28, no logo.

**Exceptions**: System share chrome uses OS type around our preview. Store icon may be the appicon / filled monogram alone. KC monogram on collector **Profil** header is **deferred** — flag; do not invent. Kit PNG folder (pixel-perfect Archivo) was not in the provided kit copy — flag if a host cannot use live-text SVG (Expo app icons, favicon at 16px).

**Source**: Brand kit v1.0 README + `svg/kitcollective-*.svg`. Brand book v1.0 §01–04 for construction. Placement: this gap. 3a artifact for “no logo on Samling header”.

Flag missing context; do not invent values, tokens, variants, or rules.

### Spacing

Status: `locked`

**Purpose**: One rhythm for padding, gaps, and insets so screens do not invent local spacing.

**Scale**: `4 / 8 / 12 / 16 / 24 / 32 / 48`.

**Roles** (prefer these in UI; primitives only in token files):
| Token | Value | Use |
| --- | --- | --- |
| `space.inset.sm` | 8px | Compact padding (chips, caption inset, admin table cells) |
| `space.inset.md` | 16px | Default screen and card padding |
| `space.inset.lg` | 24px | Generous padding (empty state, confirm sections, **admin page inset**) |
| `space.gap.sm` | 8px | Tight stacks (title + caption) |
| `space.gap.md` | 12px | Collection grid gap; form groups |
| `space.gap.lg` | 16px | Between sections |

**Usage**: Padding and gap come from the scale. Do not mix ad-hoc pixels with tokens on the same screen. Two densities, **one scale**: `mobile` / `web` confirm uses the small end of the same scale; `admin` table cells use `space.inset.sm` / `space.gap.sm` and the page uses `space.inset.lg`. Do not add `space.compact.*` tokens.

**Relationships**: Layout gutters use `space.inset.md` and `space.gap.md` on `mobile` / `web`, and `space.inset.lg` on `admin` pages. Typography line-boxes sit inside spacing, not the other way around.

**Constraints**: Primary hit targets ≥ 44×44 on `mobile`. On `admin`: table row **48px**; toolbar primary/destructive **44×44**; icon actions **32×32** with an accessible name. Compact density is usage of this scale, not one-off tighter padding and not a second token set.

**Example** *(not a rule)*: Collection grid uses `space.inset.md` page padding and `space.gap.md` between tiles. Admin Stamdata uses `space.inset.lg` page padding and `space.inset.sm` inside table cells.

**Exceptions**: Platform sheets may use safe-area insets outside the scale.

Flag missing context; do not invent values, tokens, variants, or rules.

### Elevation

Status: `locked`

**Purpose**: Depth means “this is an overlay task”, not decoration. Cards stay flat so photos read as the surface.

**Levels**:
| Level | Token | Treatment |
| --- | --- | --- |
| Canvas | `elevation.canvas` | No shadow |
| Card | `elevation.card` | No shadow. Edge is `border.subtle` |
| Overlay | `elevation.overlay` | `scrim` + `surface.raised` sheet. Optional whisper shadow `0 4px 16px` at 12% black |

**Usage**: Collection tiles stay at card (flat). Confirm, club search, and permission pre-prompts use overlay. Admin Take-down / demote use overlay (dialog) over the drill page. The floating tab bar is **chrome on canvas**, not overlay: no scrim, no focus trap. Backdrop blur on the pill is allowed so photos remain readable; do not invent a fourth elevation level. Do not raise a tile or table row on press with a drop shadow.

**Relationships**: Overlay uses `color.scrim` and `color.surface.raised`. Motion `motion.base` for present/dismiss.

**Constraints**: Overlay must dim the canvas and trap focus until dismissed. Elevation is not a brand flourish.

**Example** *(not a rule)*: Club search is a sheet over the confirm screen; the grid behind is dimmed and inert.

**Exceptions**: Camera preview is full-screen, not an elevated card.

Flag missing context; do not invent values, tokens, variants, or rules.

### Border

Status: `locked`

**Purpose**: Hairlines separate flat surfaces. Focus is a ring, not a wash. Error is a line **and** text.

**Roles**:
| Token | Treatment | Use |
| --- | --- | --- |
| `border.subtle` | 1px `color.border.subtle` | Cards, text fields, photo tiles |
| `border.strong` | 1px `color.border.strong` | Selected card or selected chip when fill is not used |
| `border.focus` | 2px `color.fill.primary`, 2px offset | Keyboard / accessibility focus |
| `border.danger` | 1px `color.danger` | Invalid field; must pair with helper text |
| Divider | 1px `border.subtle` | Two list groups with no heading between them |

**Usage**: Prefer space over dividers inside a single form group. Do not use `identity.wash` as a focus or selected ring. `border.strong` aliases `gray.900` on light and `gray.0` on dark unless a dedicated primitive is added later — do not invent a new hex.

**Relationships**: Radius follows the control. Focus ring is drawn outside the pill/card radius.

**Constraints**: Focus is always visible for keyboard and accessibility focus. Color is never the only error signal. Dividers do not replace headings.

**Example** *(not a rule)*: Search field: `border.subtle` at rest, `border.focus` on focus, `border.danger` plus “Klub er påkrævet” when Save is blocked on club.

**Exceptions**: Hairline may be omitted on a photo tile if the photo’s edge reads against `canvas`; if contrast fails, keep `border.subtle`. Flag rather than inventing a thicker stroke.

Flag missing context; do not invent values, tokens, variants, or rules.

## Tokens

Status: `locked` for foundations in this file. Component tokens are not used.

**Layers**: primitive → semantic. No component-token layer.

**Naming**: `color.{role}`, `type.{role}`, `space.inset|gap.{sm|md|lg}`, `radius.{step}`, `motion.{step}`, `elevation.{level}`. Purpose-encoded. Do not name after hex, Uber, or Vinted.

**Modes**: `light` (default), `dark` (system) on `mobile` and `web`. `admin` is **light only** — do not select dark aliases there.

**References**: Semantic color aliases primitives. `identity.wash` references `identity.wash.start` and `identity.wash.end`. Type roles alias the brand families in Typography (Archivo / IBM Plex Sans / IBM Plex Mono), not system UI as the primary family. UI must not reference primitives.

**Usage**: Select semantic tokens in UI; primitives only inside token files.

| Token | Role | References | Surfaces |
| --- | --- | --- | --- |
| `color.canvas` | Page background | gray.0 / gray.900 | mobile, web; admin light only (gray.0) |
| `color.surface` | Card / field | see Color | mobile, web, admin |
| `color.fill.primary` | Primary button | black / gray.0 | mobile, web, admin (light: black) |
| `color.fill.secondary` | Quiet fill / admin row hover | gray.50 / #2A2A2A | mobile, web, admin |
| `color.identity.wash` | Garnish gradient | start → end | mobile, web (empty, share header, thin rule, OG strip). Not a table treatment on admin |
| `type.display` / `type.title` / `type.section` / `type.heading-sm` | Heading roles | Archivo 600; see Typography | mobile, web, admin |
| `type.body` / `type.label` / `type.caption` | Body / label / meta | IBM Plex Sans; see Typography | mobile, web, admin |
| `type.mono` | Data (season, count, ID) | IBM Plex Mono; see Typography | mobile, web, admin |
| `space.inset.md` / `space.gap.md` | Default padding / grid gap | 16px / 12px | mobile, web |
| `space.inset.lg` / `space.inset.sm` | Admin page inset / table cell inset | 24px / 8px | admin |
| `radius.md` | Cards / photo tiles | 12px | mobile, web |
| `radius.sm` | Buttons, nested, admin thumbs | 8px | mobile, web, admin |
| `radius.pill` | Chips / search | 999px | mobile, web, admin |
| `elevation.card` | Flat tile | border only | mobile, web |
| `elevation.overlay` | Sheet | scrim + raised surface | mobile, admin (confirm dialog) |
| `border.focus` | Focus ring | 2px fill.primary, 2px offset | mobile, web, admin |
| `motion.fast` / `motion.base` | Quiet UI | 200ms / 300ms | mobile, web, admin |

Flag missing context; do not invent tokens or values.

## Components

Status: `locked` for the inventory below (v1 + admin gap + inbox gap + Profil gap + Gap 2026-08-31 Søg/detail/Peer). A primitive not listed: **flag**. Do not invent components or variants.

**Inventory (v1)**: Button, Button dock, Icon button, Search field, Text field, Select field, Chip, Jersey tile, Mark, List row, Photo slot, Empty state, Sheet, Tab bar, Banner.

**Inventory (admin gap)**: Data table. Place switching is the waffle (two tiles), not Top tabs. Plus existing Button, Icon button, Search field, Text field, Chip, Mark, Empty state (`table`), Sheet, Banner.

**Inventory (inbox gap)**: Thread row, Activity card, Chat bubble, Bid card, Message composer. Empty state `inbox`. Top tabs underline reused for Beskeder | Aktivitet (Danish). Tab bar slot 4 = envelope + unread count badge.

**Inventory (Profil gap)**: Switch, Avatar. List row leading/trailing slots as locked below. Own Profil composition is Pattern **Own Profil**.

**Inventory (Søg / browse gap)**: No new primitives. Patterns **Søg**, **Søg catalog drill**, **UserJersey detail**, and **Peer Profil** compose Search field, List row, Mark, Avatar, Jersey tile, Switch, Button, Sheet.

**Deferred primitives**: Checkbox, paywall card, wishlist row. Thread row may still use a 44px circular **initial** on `fill.secondary` — that is not Avatar and not a new Mark `kind`. Peer Profil and own Profil use Avatar. Admin Profile action stays a 32px operator monogram — not Avatar. Do not invent a Filter primitive (use Button + Chip in Sheet). Do not invent an admin checkbox column.

A primitive not listed: **flag**. Do not invent components or variants.

### Button

**Purpose**: Commit an action the user asked for.

**Anatomy**: Label (required). Leading icon (optional). No subtitle inside the button.

**Properties**: `variant`: `primary` | `secondary` | `tertiary` | `destructive`. `width`: `hug` (default) | `fill`. `size`: `md` (default) | `sm`. `disabled`, `loading`.

**Variants**: `primary` = the one action that moves the task forward (`fill.primary`, `content.inverse`, `radius.sm`). `secondary` = alternative on the same surface (`fill.secondary` or outline `border.subtle` on `surface`). `tertiary` = low-emphasis, often inline (no fill). `destructive` = data-loss (`danger` fill, `content.inverse`). One `primary` per visible region. Dock primaries use `width.fill` with min hit target ≥ 48×48 on `mobile`. Inline and banner actions stay `width.hug`.

**States**: Rest, pressed, focus, disabled, loading (label stays; ignore a second submit).

**Accessibility**: Visible label. Focus = `border.focus`. Disabled is not the only explanation — pair with helper text when Save is blocked. Hit target ≥ 44×44 on `mobile` and for admin toolbar primary/destructive. Contrast AA.

**Composition**: Footer actions (via **Button dock**), empty-state action, inline in confirm. Bid card: `primary` Accepter + `secondary` Afvis side by side (one bud, not two primaries). Destructive confirms in a Sheet when the cost is high. Collector Log ud and Slet min konto use Sheet `confirm`, not a full-screen place. Camera chrome and banner inline actions stay `width.hug` — not docked, not side-by-side primaries on phone. Admin Filters is a Chip in the entity Chip group, not a `secondary` Button; drill footer: `destructive` Take-down (never equal to a `primary` on the same row).

**Unsupported**: Two primaries in one region. Primary + destructive as equal side-by-side choices. `identity.wash` as button fill. Teal or cyan CTA. “+ New” as the admin toolbar primary.

**Example** *(not a rule)*: Confirm footer dock: `primary` “Gem” (`width.fill`), or “Gem og næste” when more unsaved jerseys remain; `tertiary` “Annuller” stacked below when present. Admin drill: `destructive` “Take down” opens Sheet `confirm`.

**Code**: `apps/mobile` — `Button`, `ButtonDock` in `src/components/ui.tsx`.

Flag missing context; do not invent values, tokens, variants, or rules.

### Button dock

**Purpose**: Pin footer actions to the bottom of the screen with safe-area padding.

**Anatomy**: Top border (`border.subtle`). Vertical stack (`space.gap.md`). One `primary` `width.fill` at top of stack. Optional `secondary` `width.fill` next (Cookie-indstillinger only). Tertiary paths below. Optional helper text above the primary when Save is blocked.

**Properties**: None beyond children.

**Variants**: None.

**States**: None.

**Accessibility**: Safe-area insets on `mobile`. Helper text explains blocks — disabled primary is not the only signal.

**Composition**: Login, register, confirm, empty collection, Cookie-indstillinger. Not camera chrome or inline banner actions.

**Unsupported**: Side-by-side primaries on phone. Hugging centered pill as the only primary on these screens.

**Example** *(not a rule)*: Login dock: fill “Log ind” + tertiary “Opret konto” below. Cookies: fill “Acceptér alle” + `secondary` “Kun nødvendige” + tertiary “Bekræft mine valg”.

**Code**: `apps/mobile` — `ButtonDock` in `src/components/ui.tsx`.

### Icon button

**Purpose**: Compact action when a visible text label would not fit.

**Anatomy**: Single icon. No caption inside the control.

**Properties**: `name` (accessible string, required). `icon`. `disabled`.

**Variants**: None. Emphasis comes from context, not a color variant. Do not add `primary` Icon button.

**States**: Rest, pressed, focus, disabled.

**Accessibility**: Accessible name required (e.g. “Luk”, “Kamera”, admin “Back”). Hit target ≥ 44×44 on `mobile`. On `admin`, icon actions may be **32×32** if the accessible name is present (visible tooltip or `aria-label`). Icon is not the only meaning — name is.

**Composition**: Header trailing actions (collection home: notifications; conversation: overflow “Detaljer”). Conversation back. Camera shutter chrome, admin header back, admin header cluster (pin, notifications, help, waffle). Message composer: attach image; send may sit on `fill.primary` with name “Send” — that is composer-only, not a general `primary` Icon button variant. Waffle is the admin place switcher this gap (two tiles: Master Data, User Data). Not a substitute for Tab bar Add. Not a substitute for the Profile action.

**Unsupported**: Icon-only control without a name. Emoji as the icon. 32×32 icon actions on `mobile`.

**Example** *(not a rule)*: Capture header “Luk” to abandon a draft (confirm in Sheet if photos exist).

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Search field

**Purpose**: Filter a collection, find a catalog club, find a city on Min lokation, run Søg typeahead (stamdata + Handles + jersey text), or filter an admin table by typed query.

**Anatomy**: Leading search icon (decorative). Field. Optional clear control (Icon button). Visible label or `accessibilityLabel` (required).

**Properties**: `value`, `placeholder` (not a label substitute), `onSubmit` / live filter. Collection search may filter as you type. Club search queries catalog IDs, never free-text club as truth. City search stores a tag (popular city or free tag), not a Places ID. Admin search matches CatalogLabel aliases in every locale; displayed labels stay `en` on this surface. Søg typeahead matches CatalogLabel (and aliases), Kit identity labels, Player labels, and Handles — choosing a hit navigates; it does not invent a free-text club.

**Variants**: `collection` (legacy name: typed filter over a jersey list — on **Søg** this drives magazine typeahead / “Flere trøjer” text filter, **not** own-Samling find). `catalog` (club pick on confirm). `city` (Min lokation city search — query is a tag, not Places chrome). `admin` (app header). Same chrome; different data. Do not add a header-search variant on collection home. Do not invent a fifth variant named `discover`.

**States**: Rest, focus, disabled, empty. Error is rare; if the query cannot run, use Banner, not a red search field.

**Accessibility**: Label associated. Hit target ≥ 44 tall. Keyboard: search / default.

**Composition**: Søg place, inside a Sheet for club pick, Min lokation city screen, or admin app header (leading icon, pill that fills the header center column). **Not** the collection home header. Uses `radius.pill`, `border.subtle`, `type.body`. Admin header search is not capped at the 28rem toolbar max. City focus uses `border.strong` (same as Send bud amount) — not wash. On Søg, focus with a non-empty query **replaces** the magazine body (Pattern Søg) — not a translucent overlay that leaves shelves readable behind.

**Unsupported**: Land → league → club hierarchy instead of search. Free-text club saved as catalog truth. Wash fill inside the field. Google Places / “use my location” chrome on Min lokation. Trøjer|Katalog|Samlere as Search field modes.

**Example** *(not a rule)*: Confirm Sheet labelled “Klub”, placeholder “Søg klub”. Søg placeholder “Klub, trøje, spiller eller samler”. Admin header placeholder “Search”. Min lokation placeholder “Søg efter by”.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Text field

**Purpose**: Collect a short string we actually store (notes under “Flere detaljer”; unique username and About me on Rediger profil; email and password on Admin SPA login). Not for club, season, type, size, or condition.

**Anatomy**: Visible label (required). Field. Hint (optional). Error (optional; replaces hint when invalid).

**Properties**: `value`, `placeholder` (not a label substitute), `optional`, `error`, `disabled`, platform keyboard hint. `type`: text | email | password as the platform allows.

**Variants**: Single-line default. Multiline for notes and About me.

**States**: Rest, focus, disabled, error. Empty is a value, not a special chrome.

**Accessibility**: Label associated. Error = `border.danger` **plus** text, announced when it appears. Admin login labels in English.

**Composition**: Stacks in the Sheet “Flere detaljer” with `space.gap.md`. Optional custom name on Ny genvej (same Sheet). Rediger profil: username and About me (multiline for About me). Username helper — three caption states, never `success` green and never a green check:

| State | When | Caption role |
| --- | --- | --- |
| Yours | The value is this collector’s current username | `content.secondary` — *example*: “Dit brugernavn — unikt og følger dig rundt.” |
| Available | Typed value is free | Same role, short confirmation — *example*: “Ledigt.” |
| Taken | Typed value belongs to someone else | `danger` plus text — *example*: “er optaget.” Color is not the only signal. |

Admin login card: email then password, then `primary` Sign in. Does not sit inside a Button. Not for catalog identity (club/season) — that is Search field or Select field.

**Unsupported**: Placeholder-only labels. Using Text field for catalog identity (club/season). Validating empty fields on every keystroke before blur/Save. Encoding “available” with `success` fill, a teal check, or any green chrome.

**Example** *(not a rule)*: Label “Noter”, optional, body keyboard. Admin: “Email”, “Password”.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Select field

**Purpose**: Show a chosen catalog facet (or “unset”) and open a searchable picker. Not a free-text identity field.

**Anatomy**: Visible label (`type.label` 13). Tappable row, height **52px**. Value or placeholder (`type.body`). Trailing chevron. No inline dropdown menu.

**Properties**: `label` (required). `value` optional (CatalogLabel / id). `placeholder`. `facet`: `country` | `league` | `club` | `player`. `onPress` opens the facet picker. `disabled`.

**Variants**: None. Facet is data, not a visual variant.

**States**: Rest, pressed, focus, disabled, empty (placeholder). Empty is allowed until Gem — Gem stays disabled until at least one facet is set.

**Accessibility**: Label associated. Name = label + current value or “ikke valgt”. Hit target = full 52px row (≥ 44).

**Composition**: Ny genvej body inside the Genveje Sheet. Press → full-screen facet picker (Search field + List row + Mark). Not used for kit type / size / condition (those are Chip `single-select`).

**Unsupported**: Typing a club name as catalog truth. Native `<select>` / spinner as the product picker. Opening Genveje from the tab-bar plus.

**Example** *(not a rule)*: Label “Klub”, value “F.C. København”, chevron.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Chip

**Purpose**: Pick one value from a small closed set (type, size, condition), toggle an admin filter, or select one collection **genvej**.

**Anatomy**: Label (`type.label`, 14px on collection chips). Optional leading Mark (not emoji). No photo inside a chip.

**Properties**: `label` (required). `selected`. `disabled`. `onPress`.

**Variants**:
| Variant | Need |
| --- | --- |
| `single-select` | Confirm: type / size / condition. One per group |
| `filter` | Admin Filters Sheet. More than one may be on |
| `shortcut` | Collection home genveje. **Exactly one** selected. First chip is **Alle** (locked, not deletable) |

**States**: Rest, pressed, selected, disabled, focus. Selected = `fill.primary` + `content.inverse`. Not the wash.

**Accessibility**: Role radio for `single-select` and `shortcut`; checkbox for `filter`. Name = label. Hit target ≥ 44 tall. Admin chip labels in English. **Tilpas** is not a Chip — it is `tertiary` text (“Tilpas”), named “Tilpas genveje”.

**Composition**: Horizontal row with `space.gap.sm` (collection: scroll horizontally if needed). Confirm Chip groups. Admin Filters Sheet. Admin toolbar: entity Chips (Master Data tables or User Data tables) in one group; Filters is a Chip in that same Master Data group and opens the Filters Sheet (pressed when catalog filters are on, not for header search alone). Collection home: `shortcut` chips **under** the header, then Tilpas. Hide the **entire** chip row (Alle, genveje, Tilpas) when the collection is empty. Owner `mobile` collection only — not public Astro.

**Unsupported**: Chip as a primary CTA. Kit-type chips (Hjemme/Ude/Tredje) on Samling. Encoding type with wash variant 2/3. Emoji. Plus control to add a genvej (plus is capture). Auto-selecting a chip after Gem (Alle stays selected). Star ratings or a fifth “God” scale for condition — Confirm uses Ny / Brugt / Slidt. A “Mere” chip that dumps leftover kit types onto another tab — Keeper and Special stay in the type group.

**Example** *(not a rule)*: Confirm: “Ny” / “Brugt” / “Slidt”. Samling: “Alle” selected, then “Superliga”, “FCK”; trailing “Tilpas”. Admin Filters: “Has photo” as `filter`.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Jersey tile

**Purpose**: Show one UserJersey in a collection as a photo-first card.

**Anatomy**: Photo (required to *display*; placeholder Mark/monogram only if the row has no photo yet — Save still requires at least one photo). Caption stack: club (`type.heading-sm`) then season · type (`type.mono`). No price. No buy. No ratings.

**Properties**: `photo` (user JPEG). `clubLabel`, `seasonLabel` from resolved `CatalogLabel`. `onPress` opens detail. Crop **4:5**.

**Variants**: `mobile-grid` and `web-grid` share anatomy; column count comes from Layout.

**States**: Rest, pressed, focus. No hover-elevation. Loading photo: flat `fill.secondary` placeholder, not a skeleton wash.

**Accessibility**: Name = club + season (and type if shown). Photo is informative; do not hide caption. Hit target = whole tile.

**Composition**: Collection grid, Astro collection, and own-Profil **Favoritter** (two-column, same 4:5 crop and caption). Not used as the capture preview. Favorites tiles do **not** show owner handle, heart overlay, or price — owner lives on the jersey detail.

**Unsupported**: Price, boost, marketplace footer. `identity.wash` behind the photo. Archive `KitPhoto`. Crop to 1:1 or 16:9 on the tile. Admin home or admin table rows (those use Data table thumbs).

**Example** *(not a rule)*: 4:5 FCK 2023/24 home photo; club “F.C. København”; mono “2023/24 · Hjemme”.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Mark

**Purpose**: Identify a stamdata entity beside its label without using emoji or invented artwork.

**Anatomy**: Square or circular image slot. If no licensed asset: gray `fill.secondary` tile + one or two letters from `CatalogLabel` (`type.label` or `type.caption`).

**Properties**: `kind`: `country` | `league` | `club` | `player`. `asset` optional. `label` required for fallback letters and accessible name.

**Variants**: None beyond `kind` (slot meaning). Sizes: `sm` 24px (chip), `md` 32px (list row). Do not invent more sizes.

**States**: Rest only. Missing asset is fallback, not an error state.

**Accessibility**: Name = entity label. Fallback letters are visible text or a labelled graphic. Decorative only when the adjacent text already names the entity — then hide the mark from the accessibility tree and keep the name on the row.

**Composition**: Leading slot on List row; optional on Chip. Not a replacement for Jersey tile photo.

**Unsupported**: Emoji. Made-up crests. Archive kit JPEG as club logo. Player portrait when no approved asset.

**Example** *(not a rule)*: Club row with crest if licensed; otherwise “FC” on gray.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Avatar

**Purpose**: Show the signed-in collector’s identity photo on own Profil.

**Anatomy**: Circle. Photo fills the circle (cover crop) when present. Fallback: one or two letters from the username on `fill.secondary` (`type.label` or `type.heading-sm` by size). No KC monogram. No club Mark.

**Properties**: `uri` optional. `initials` required for fallback and accessible name. `size`: `lg` | `md`.

**Variants**: None beyond size.
| Size | Diameter | Where |
| --- | --- | --- |
| `lg` | 64px | Own Profil identity card (home) |
| `md` | 56px | Rediger profil “Skift foto” row |

**States**: Rest, pressed (when the control changes the photo), focus. Missing photo is fallback, not an error.

**Accessibility**: Name = the collector’s username (or “Profilfoto” when the control is “Skift foto”). Hit target ≥ 44 — the `md`/`lg` circle is large enough; the whole “Skift foto” row is the control on edit. Color is not the only identity signal (initials remain).

**Composition**: Own Profil identity card and Rediger profil photo row. Photo pick uses the platform picker; do not invent a crop editor this gap. Not a replacement for Jersey tile, Mark, Thread row initial, or the admin 32px operator monogram.

**Unsupported**: KC monogram as a collector face. Square crop. A third size. Using Avatar for Thread row (that 44px circular **initial** stays). Using Avatar as a club/country Mark. Skipping Avatar on Peer Profil (Peer uses Avatar `lg` like own Profil home).

**Example** *(not a rule)*: Home card: 64px photo of the collector, handle `eskou` beside it. No photo: “E” on `fill.secondary`.

**Code**: Unmapped. Flag. Throwaway `prototype-profile/` is not the host API.

Flag missing context; do not invent values, tokens, variants, or rules.

### Switch

**Purpose**: A binary preference the collector can change (show city, a notification category, a privacy toggle, an optional cookie category).

**Anatomy**: Track 52×32 (`radius.pill`). Thumb 28px circle inset 2px. No label on the control — the adjacent List row title is the name.

**Properties**: `on` (boolean). `disabled`.

**Variants**: None.

**States**:
| State | Track | Thumb |
| --- | --- | --- |
| Off | `border.subtle` (`gray.100` light; dark `border.subtle`) | `surface` |
| On | `fill.primary` | `content.inverse` |
| Disabled | Same fills at 40% opacity | Same; control does not toggle |

**Accessibility**: Role switch. Name = the row title (plus essential helper). The **row** is the hit target (≥ 44 tall), not only the 52×32 track. Thumb position is the non-color on/off cue. Focus uses `border.focus` on the row. Reduced motion: snap, no travel.

**Composition**: Trailing on a settings List row. Row press toggles. Do not pair a Switch with a chevron on the same row. Necessary cookies are **not** a Switch — they use `mono` meta “Altid aktive”. Master push off dims sibling rows to 40% opacity (pattern), it does not invent a Switch variant.

**Unsupported**: Teal / wash / success-green track. Checkbox as a stand-in. A dead Switch for necessary cookies. Two Switches as equal primary actions in one row. Encoding on/off with color alone.

**Example** *(not a rule)*: “Vis by på profil” with helper “Slået fra vises kun landet på din profil.” Track on = black, thumb white.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### List row

**Purpose**: Show one catalog or settings item and let the user select, toggle, or navigate.

**Anatomy**: Leading slot (optional). Title (`type.body` or `type.label`). Optional helper under the title (`type.caption` / `content.secondary`). Optional `mono` meta. One trailing slot. Hairline `border.subtle` between rows in a group. Default row height 56; 64 when title + meta both show (e.g. Favoritter).

**Properties**: `title` (required). `meta` optional (`type.mono` or `caption`). `helper` optional. `onPress` or `selected`. Optional `tone`: `neutral` (default) | `danger` (`danger` on icon and title; never color alone).

**Leading** (exactly one):
| Value | Use |
| --- | --- |
| `none` | Default settings drills, language/city rows, cookie categories |
| `mark` | Catalog club / facet picker |
| `icon` | Own Profil home: Favoritter, Indstillinger, Cookie-indstillinger. Line icon, optical size ~22, `content.primary`. Same glyph family as Tab bar — flag the host set; do not invent a new icon family |
| `avatar` | Rediger profil “Skift foto” (`Avatar` `md`) |
| `handle` | `manage` drag-handle only |

**Trailing** (exactly one — never Switch + chevron):
| Value | Use |
| --- | --- |
| `chevron` | `navigate` drills |
| `switch` | Binary preference; the row is the hit target (Switch) |
| `check` | Selected item in a single-choice list (language, appearance, selected city). Check uses `fill.primary`, not `success` green. No chevron on the selected row |
| `action` | Tertiary text in the trailing slot — *example*: “Skift” on e-mail / telefon. Not a new primitive |
| `none` | Non-drilling status — *example*: Google “Tilknyttet”; necessary cookies “Altid aktive” is `meta`, not a Switch |
| `manage` | Edit + delete Icon buttons (Genveje only) |

`mono` meta such as “Nuværende”, “Bekræftet”, “Altid aktive”, or a current value (“Dansk”) may sit **before** `chevron` when the row is still a drill. Meta + `check` together is allowed (selected city “Valgt” may be the check alone). Meta + `switch` is not — helper text goes under the title.

**Variants**: `select` (club search / facet picker / language / appearance / city). `navigate` (Detaljer → Peer Profil; own Profil settings and location; Søg typeahead hits). `toggle` is **not** a variant — use `navigate`-shaped chrome with trailing `switch`. `manage` (Genveje). `danger` (Detaljer Rapportér / Blokér / Slet samtale; Peer Profil / foreign detail overflow; own Profil Log ud in the hub — `icon` + label, no chevron).

**States**: Rest, pressed, selected, disabled, focus. List loading is list-level, not a row variant. Disabled `toggle` rows (master push off) use 40% opacity on the sibling group — pattern, not a row variant.

**Accessibility**: Name = title + essential meta + helper. Chevron decorative when the row is the control. Switch name = row title. `action` “Skift” is named with the field (“Skift e-mail”). Height ≥ 44 on `mobile`. `manage`: drag-handle named “Flyt”; edit and delete are Icon buttons with names; count is `type.mono` and included in the name.

**Composition**: Lives in a list inside a Sheet, a full-screen facet picker, or a grouped `surface` on `fill.secondary`. Empty list uses Empty state. `manage` only in the Genveje Sheet. `icon` leading only on own Profil home rows named above.

**Unsupported**: Multiple primary actions in one row **except** `manage` (edit + delete are explicit). Switch + chevron. Row as a form (username / About me are Text fields). Price as meta. Using `manage` on confirm club search. Using List row for Beskeder threads (that is Thread row). Leading Mark as a collector face (that is Avatar). Success-green check for selected language.

**Example** *(not a rule)*: Club search: Mark + “F.C. København” + meta “Superliga” + chevron. Profil home: heart `icon` + “Favoritter” + meta “4 trøjer” + chevron. Language: “Dansk” + `check`. “Vis by på profil” + helper + `switch`.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Photo slot

**Purpose**: Capture or assign one UserJersey photo with a role.

**Anatomy**: Preview (camera or thumbnail). Role label (`front` | `back` | `label`). Optional empty dashed `border.subtle` when vacant.

**Properties**: `role`: `front` | `back` | `label`. `uri` optional. `onPress` capture or replace.

**Variants**: `camera-overlay` (full-bleed preview, three slots). `confirm-strip` (thumbnails on confirm).

**States**: Empty, filled, selected (which slot is next), focus. At least one filled photo required to Save; all three recommended, not required.

**Accessibility**: Name includes role in Danish UI (“Forside”, “Bagside”, “Mærke”). Empty slot says it is empty. Hit target ≥ 44.

**Composition**: Camera session pattern; confirm strip. Gallery-first onboarding fills slots from the picker.

**Unsupported**: Emoji placeholders. Using ImagePicker camera as the primary repeat path (in-app `CameraView` is the repeat path). Blocking Save on all three slots.

**Example** *(not a rule)*: Three overlay slots; Forside filled, Bagside and Mærke empty.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Empty state

**Purpose**: Explain an empty collection, an empty Indbakke, or an empty admin table and the next useful action when there is one.

**Anatomy**: Title (`type.section` on `mobile`; `type.title` if a host already mapped collection empty to title — do not invent a third size). One-sentence body (`type.body`). Optional thin `identity.wash` rule above the title (garnish). Optional Button.

**Properties**: `title`, `body`, `action` (optional). `variant`.

**Variants**: `collection` (one `primary` action starts add/capture). `inbox` (no action this gap — honest empty). `table` (admin; no create control — optional `tertiary` “Clear filters” only).

**States**: Rest. Do not animate emptiness.

**Accessibility**: Text is meaning; wash is decorative. Action uses Button when present. Admin copy in English. `inbox` copy in Danish.

**Composition**: `collection` replaces the grid **and** hides the genveje chip row. `inbox` replaces the Beskeder (and Aktivitet) list; Tab bar stays. `table` replaces the Data table body when there are zero rows.

**Unsupported**: Sarcasm. Three actions. Empty state used for Save errors (that is Banner). Full-bleed wash background. Illustration libraries or emoji. `table` variant with a `primary` “+ New” / Add kit. Fake threads to avoid emptiness. `inbox` with a `primary` that invents “start a chat” with no recipient.

**Example** *(not a rule)*: “Ingen trøjer endnu” + “Tilføj den første fra galleriet.” + `primary` “Tilføj trøje”. Indbakke: “Ingen beskeder endnu” + “Når en anden samler byder på en af dine trøjer, starter samtalen her.” Admin: “No kits match” + `tertiary` “Clear filters”.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Sheet

**Purpose**: Focused overlay task over the current screen (club search, more details, Genveje, admin Filters, destructive confirm including collector log out and delete account).

**Anatomy**: Scrim. Raised surface (`radius.lg` on the sheet). Grab/handle optional (mobile). Title. Body. Optional footer Buttons.

**Properties**: `title`, `children`, `onDismiss`.

**Variants**: `form` (club search / more details / admin Filters / **Genveje**). `confirm` (destructive Take-down or demote; collector **Log ud** and **Slet min konto** — not a full-screen place).

**States**: Presenting, rest, dismissed. Focus trapped while open.

**Accessibility**: Title is the accessible name. Scrim dim + focus trap. Escape dismisses when the task is cancellable. Swipe-down may dismiss on `mobile` only. `motion.base`; reduced-motion = instant present, no travel. Admin titles in English.

**Composition**: `elevation.overlay`. Contains Search field, List row, Text field, Select field, or Chip groups. Does not contain Tab bar or Top tabs. Admin Filters: Chip `filter` groups (country, league, season, kit type, has photo). Admin confirm: title, consequence sentence, `destructive` + `tertiary` Cancel. Collector confirm: same anatomy — title, consequence sentence, dock `destructive` (Log ud / Slet min konto) + `tertiary` Annuller. Genveje: list and Ny genvej **share one Sheet** (body swaps; titles “Genveje” / “Ny genvej”). Facet pick is a **full-screen overlay** on top of that Sheet (Search field + List row), not a second Sheet.

**Unsupported**: Full-screen **place** for Genveje (it is a Sheet over Samling, not a sixth tab). Full-screen **place** for Log ud or Slet min konto (both are Sheet `confirm`). Nested **Sheets** more than one deep — flag. Wash as scrim. Using Sheet as the admin drill (drill is a full page). Plus in the tab bar opening this Sheet.

**Example** *(not a rule)*: “Vælg klub” with Search field + List rows. Genveje Sheet: manage rows + `primary` “Tilføj”. Admin: “Take down this jersey?” with `destructive` “Take down”. Collector: “Log ud af KitCollective?” + “Din samling og dine favoritter bliver gemt.” + `destructive` “Log ud” + `tertiary` “Annuller”.

**Code**: Unmapped. Flag. Platform sheet OK if tokens (radius, colors) still apply.

Flag missing context; do not invent values, tokens, variants, or rules.

### Tab bar

Status: `locked` (Gap 2026-08-23: 3a five-slot icon-only pill. Gap 2026-08-28: slot 4 Indbakke + unread badge. Gap 2026-08-28: hide on own-Profil drills. Gap 2026-08-31: Søg stack + Peer Profil / UserJersey detail hide rules).

**Purpose**: Switch the app’s five primary collector places. Center plus is capture, not a listing compose and not “new shortcut”.

**Anatomy**: Floating glass pill above the safe-area inset (Layout). Five slots, left → right:

| Slot | Icon metaphor | Accessible name (da) | Action |
| --- | --- | --- | --- |
| 1 | House | Samling | Own collection (app home after login) |
| 2 | Compass | Søg | Search place — magazine home + typeahead + catalog drills. Compass is the Søg **icon**, not a rename to “Discovery” |
| 3 | Raised plus (larger than the others, still **inside** the pill) | Tilføj trøje | Starts Photo slot capture. No destination screen named Add |
| 4 | Envelope | Indbakke | Messages place (Beskeder \| Aktivitet). Not Ønske |
| 5 | Person | Profil | Profile place |

Visible chrome is **icon-only**. No tab labels under the icons. No logo in the pill.

**Unread (all three, this gap)**:
- **Thread row / Activity card**: unread item uses `fill.secondary` (read Activity card uses hairline `border.subtle` on `surface`).
- **Slot 4 badge**: integer count of unread conversations in the shared Beskeder/Aktivitet model. `fill.primary` + `content.inverse` + `mono`. Not red. Not `identity.wash`. Hide the badge at `0`. Do not invent a 99+ cap — flag if the host needs one.
- **Samling header bell**: stays. It is **not** the Indbakke count. Do not duplicate the envelope badge onto the bell.

**Properties**: `active`: `collection` | `search` | `inbox` | `profile`. Plus is not an `active` place — pressing it starts capture and does not leave a selected plus state after dismiss. `unreadCount` (number, default 0) on slot 4 only. `onSelectPlace`, `onCapture`.

**Variants**: None. Unselected = `content.muted`. Selected place = `content.primary`. Selected slot 4 may use a quiet `fill.secondary` well behind the envelope (4a) — not a wash, not a sell bubble. Plus uses primary ink. No fill behind other icons except the glass pill.

**States**: Active place, inactive, focus, pressed. Capture presenting is not a sixth tab state. Badge visible vs hidden (`unreadCount === 0`).

**Accessibility**: Role tab/tablist for the four places; plus is a button named “Tilføj trøje”. Names required even though chrome is icon-only. Slot 4 name includes the count when the badge is visible (e.g. “Indbakke, 2 ulæste”). Hit target ≥ 44 per slot plus inset. Color is not the only selected signal (icon weight / fill vs outline — flag the host glyph set; do not invent a new icon family). Badge is not the only unread signal (row/card fill remains).

**Composition**: Screen footer region on `mobile` collector chrome. Public Astro and `admin` do not use this component. Selecting plus starts the capture flow; it does not open Genveje. **Hide** the Tab bar for: the whole capture session (chooser, system picker return, bind, Confirm, post-Save “Ny trøje” / “Samme klub”); Samtale; Detaljer; **UserJersey detail** (own and foreign); **Peer Profil**; **every own-Profil drill** (Rediger profil, Min lokation and city search/tag, Favoritter, Indstillinger and all settings leaves, Cookie-indstillinger). **Show** it on Samling, **Søg home** (including typeahead body), **Søg catalog drill**, Indbakke list (including empty), own Profil **home only**, and Send bud. Compass remains the active place on Søg home, typeahead, catalog drill, and Send bud. It returns when the collector lands on Samling after capture, back-navigates from Samtale to Indbakke, back-navigates from a Profil drill to Profil home, or back-navigates from detail / Peer Profil / drill to Søg home.

**Unsupported**: Visible labels (brand-book in-book tabs). Two-item Samling/Tilføj dock. FAB or plus **outside** the pill. Sixth control. Heart / Ønske in slot 4. “Discovery” as the product name for slot 2. Plus as “ny genvej”. Marketplace sell icon. Logo. Use on `admin` (Top tabs). Badge on slots 1–3 or 5. Red badge. Using the Samling bell as the Indbakke unread count. Showing the Tab bar on Peer Profil or UserJersey detail.

**Example** *(not a rule)*: On Indbakke, envelope is primary ink with a black “2”; house/compass/person muted; plus raised in the middle. On Samling, house is primary; bell in the header is a separate control.

**Code**: Unmapped. Flag. Throwaway Expo prototype is not the contract.

Flag missing context; do not invent values, tokens, variants, or rules.

### Thread row

**Purpose**: One conversation in Beskeder. Navigate to Samtale.

**Anatomy**: Leading 44×44 circular initial on `fill.secondary` (first letter of handle, Archivo 600). Handle (`heading-sm`). Snippet (`body`, one line, truncate). Relative time (`mono`, `content.muted`). No trailing chevron required.

**Properties**: `handle` (required). `snippet` (required). `time` (required). `unread` (boolean). `onPress`.

**Variants**: None. Unread vs read is a state, not a variant.

**States**: Read (canvas/`surface` row). Unread (`fill.secondary` row; snippet `content.primary` weight 500). Pressed, focus. Wide selected: unread/read fill plus 2px `fill.primary` leading edge (Layout ≥1024).

**Accessibility**: Name = handle + snippet + time; include “ulæst” when `unread`. Hit target ≥ 44 tall (row padding 14/20 in 4a is the example, not a token). Color fill is not the only unread signal (weight on the snippet).

**Composition**: Beskeder list under Top tabs. Empty list uses Empty state `inbox`. Do not use List row here.

**Unsupported**: Price as snippet. Jersey photo as the leading slot. Heart/wishlist chrome. Badge count on the row (count lives on the Tab bar envelope).

**Example** *(not a rule)*: `mikkel_fck` + “Hey — den hænger stadig…” + “2 t” on `fill.secondary`.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Activity card

**Purpose**: One bid or thread event in Aktivitet. Tap opens the same conversation as the matching Thread row.

**Anatomy**: Title (`body` / `label`). Kit line (`mono`: club · season · type). Amount (`mono` 20px) in the **card body**, never over a jersey photo. Status (`mono`, `content.muted`: e.g. Afventer). Source handle. Trailing chevron (tap affordance). Optional jersey thumb is not required this gap — flag if a host adds one.

**Properties**: `title`, `kitLine`, `amount`, `status`, `fromHandle`, `unread`, `onPress`.

**Variants**: None. Event kind is copy, not a color variant.

**States**: Unread = `fill.secondary` fill. Read = `surface` + hairline `border.subtle`. Pressed, focus.

**Accessibility**: Name = title + amount + status + handle. Chevron decorative. Hit target ≥ 44. Amount is text, not color-only.

**Composition**: Aktivitet list. Same unread model as Thread row. Last cards clear the Tab bar.

**Unsupported**: Amount as overlay on a 4:5 tile. Buy / boost / ratings. A second inbox with a different unread count. Wash as unread.

**Example** *(not a rule)*: “Nyt bud på din trøje” + “FC København · 2024/25 · Hjemme” + “500 kr” + “Afventer” + “fra mikkel_fck”.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Chat bubble

**Purpose**: One message in a conversation.

**Anatomy**: Body (`body`). Timestamp below (`mono`, `content.muted`). Optional 4:5 image (`radius.md`) instead of or with text. No handle next to the bubble (handle is the conversation header).

**Properties**: `role`: `incoming` | `outgoing`. `text` optional. `image` optional. `time` required. At least one of `text` or `image`.

**Variants**: `incoming` = left, `fill.secondary` (dark mode: the dark `fill.secondary` alias — do not invent `#1C1C1C`). `outgoing` = right, `fill.primary` + `content.inverse`. Image follows the same alignment as its `role`.

**States**: Rest, focus. Sending/failed: flag — do not invent a third fill.

**Accessibility**: Name = text or “Billede” + time + “sendt” / “modtaget”. Image needs a short accessible description when the host has one; otherwise “Billede”. Contrast AA on both fills.

**Composition**: Conversation column with centered date (`mono`, `content.muted`) and Bid cards. Message composer below. Max width ~280–300px in 4c is an example, not a token — flag if a host needs a named max.

**Unsupported**: Left = me. Teal bubbles. Wash bubbles. System copy in a bubble (that is Bid card or centered date). Monogram glued to every bubble.

**Example** *(not a rule)*: Left gray “Hey — den hænger stadig…”; right black “500 er lidt lavt…”; right 4:5 neck label photo.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Bid card

**Purpose**: A bud as a timeline object in the thread — communication, not checkout.

**Anatomy**: Body sentence (`body`). Amount (`mono` 20px) + status (`mono`, `content.muted`). Incoming **pending** only: Button `primary` **Accepter** + Button `secondary` **Afvis**, side by side, each ≥ 44 tall. Card on `surface` + `border.subtle` + `radius.md`. Align start (left), not centered.

**Properties**: `body`, `amount`, `status`: `pending` | `accepted` | `declined`. `incomingPending` (boolean). `onAccept`, `onDecline` when `incomingPending`.

**Variants**: None. Status is copy + which buttons show, not a wash.

**States**: Pending (buttons if incoming). Accepted / declined (no buttons). Pressed/focus on buttons only.

**Accessibility**: Name = body + amount + status. Buttons named “Accepter” / “Afvis”. Two actions here are accept vs decline of **one** bud — not two primaries for unrelated tasks. Reduced-motion: no travel on status change.

**Composition**: Conversation column. Creating a bud uses Send bud (under Søg), not this card’s footer.

**Unsupported**: Payment sheet. “Køb nu”. Amount on a Samling tile. Outgoing pending showing Accepter/Afvis for the sender. Help link.

**Example** *(not a rule)*: “mikkel_fck bød på din FC København 2024/25 Hjemme.” + “500 kr” + “Afventer” + Accepter / Afvis.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Message composer

**Purpose**: Reply with text and/or a photo at the bottom of Samtale.

**Anatomy**: Optional reply-to line (`body`/`caption`, truncate) + dismiss Icon button. Row: attach Icon button (name “Tilføj billede”) + Text field (placeholder “Skriv en besked”, `fill.secondary`, `radius.sm`, height ≥ 44) + send control (44×44, `radius.sm`, `fill.primary`, icon, name “Send”).

**Properties**: `value`, `replyTo` optional, `onDismissReply`, `onAttach`, `onSend`, `disabledSend` when empty and no pending image.

**Variants**: None. Do not add an Android Material variant this gap.

**States**: Rest, focus on the field (`border.strong` / `border.focus`, not wash). Disabled send when there is nothing to send. Keyboard open: composer stays above the OS keyboard; Tab bar is already hidden.

**Accessibility**: Field has a visible placeholder and an accessible name (“Besked”). Send disabled is not the only explanation. Hit targets ≥ 44. Contrast AA on the send fill.

**Composition**: Pinned to the conversation footer (safe-area). Not Button dock. Not on Indbakke list.

**Unsupported**: Teal send. Wash focus. Showing the Tab bar behind the composer. A second primary next to Send.

**Example** *(not a rule)*: Reply-to “Hey — den hænger stadig…” with dismiss; empty field; black send.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Banner

**Purpose**: Persistent or until-dismissed system feedback for a task failure or blocker (Save failed, catalog miss).

**Anatomy**: Body text (`type.body`). Optional title. Optional tertiary action. Not a stack of toasts.

**Properties**: `tone`: `danger` | `warning` | `info` | `success`. `message` (required). `action` optional.

**Variants**: Tone only. Never use `identity.wash` as tone.

**States**: Visible, dismissed. Do not auto-hide a Save error before the user can read it.

**Accessibility**: Announced when it appears. Tone is not the only signal (text + optional icon that is not emoji). Contrast AA.

**Composition**: Top of the current screen or confirm, below the header. One banner at a time.

**Unsupported**: Toast rain on every chip tap. Vision “still loading” as danger. Blocking Save with a banner instead of keeping the draft.

**Example** *(not a rule)*: `warning` “Klubben findes ikke i kataloget endnu” + draft kept; upgrade CTA is a Button, not a chip wash.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Data table

**Purpose**: Scan stamdata or collectors as rows, not as a photo grid.

**Anatomy**: Column headers use the **same size** as body cells, at a **bolder weight** (Base Data Table). Rows **48px** tall. Sticky header on scroll. **32×32** square thumb (`radius.sm`) on Kit and UserJersey rows; empty 32px slot when no photo. Club, season, and user identity rows use Mark/monogram instead of a KitPhoto thumb. Primary cell `type.body`. Season/ID/count cells `mono` at body size. Row divider `border.subtle`. Odd data rows `fill.secondary`, even data rows `surface` (zebra). No checkbox column.

**Properties**: `columns` (header + cell). `rows`. `onRowActivate` (required: opens drill). `selectedRowId` optional. Thumb URI required for Kit and UserJersey rows (empty slot if missing bytes).

**Variants**: `stamdata` and `collectors` share anatomy; columns differ. Do not add a third visual variant.

**States**: Rest (zebra), hover (row one shade darker: `border.subtle` on a gray row, `fill.secondary` on a white row), selected (same darker fill), focus (row + `border.focus`), empty (body replaced by Empty state `table`), loading (keep header; do not invent a skeleton wash). Column header hover may darken that header cell; do not invent sort chevrons until a column has a sort affordance.

**Accessibility**: Role table (or grid if the host requires it for keyboard). Row is the control; Enter/Space activates drill. Tab moves to the table; arrow keys move between rows. Color is not the only selected signal (hover/selected fill plus focus ring). Thumbs have empty alt when decorative next to a text name; if the thumb is the only photo cue, name the row including “photo” / “no photo”.

**Composition**: Admin shell body. Does not wrap Jersey tiles. Filters live in the toolbar Sheet, not as extra header widgets besides sort — flag a sort affordance if a column needs it rather than inventing a new primitive.

**Unsupported**: Bulk checkboxes. Batch action bars. 4:5 tiles. “+ New” in the table header. Archive JPEG as a club Mark. Stretching the thumb to 4:5. Players as a primary table in this gap. Importing Base Web.

**Example** *(not a rule)*: Stamdata kits: thumb, club (`en` CatalogLabel), season, type, photo count. Click opens kit drill.

**Code**: Unmapped until `apps/admin` exists. Flag; do not invent a host API.

Flag missing context; do not invent values, tokens, variants, or rules.

### Top tabs

**Purpose**: Two-item underline control. Unused for admin **place** switching (waffle: Master Data | User Data). Club-drill Players | Jerseys. **Indbakke Beskeder | Aktivitet** on `mobile`.

**Anatomy**: Horizontal text tabs. Active: `content.primary` plus a **2px** `fill.primary` underline. Inactive: `content.secondary`. No pill fill. No icons required. Hairline under the row (`border.subtle`).

**Properties**: `items`: exactly two. `active`. `onChange`. Labels: English on `admin` (Players | Jerseys); Danish on Indbakke (**Beskeder** | **Aktivitet**).

**Variants**: None. Two items. A third inbox tab — flag.

**States**: Active, inactive, focus, hover. Underline moves with `motion.fast`; reduced-motion = instant, no travel.

**Accessibility**: Role tab/tablist. Keyboard: Left/Right between tabs. Hit target ≥ 44 tall.

**Composition**: Not in the admin shell this gap. Waffle menu is two tiles (icon above, title below). Club drill reuses this underline anatomy for Players | Jerseys, with a native Season `<select>` on the right of that row. Indbakke: under the **Indbakke** title, above the list. Does not replace mobile Tab bar. Does not contain a “+ New” control.

**Unsupported**: Pill tabs. Four “metric table” pills. Icons-only tabs. Using Tab bar on `admin`. A third waffle place in this gap. Using Top tabs for Master Data | User Data. Chip `shortcut` as Beskeder | Aktivitet.

**Example** *(not a rule)*: Indbakke: Beskeder underlined black; Aktivitet muted. Stamdata club drill: Players | Jerseys.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

## Patterns

Status: `locked` for the compositions below. Other compositions: flag.

### Collection grid

**Purpose**: Scan owned jerseys.

**Composition**: Header (Samling + count + notification; no Search field) + Chip `shortcut` row + Tilpas (hidden when empty) + two-column Jersey tiles (`space.gap.md`, `space.inset.md`) + floating Tab bar. Empty collection uses Empty state `collection` instead of the grid **and** instead of the chip row.

**Unsupported**: Marketplace card extras. One-column gallery of uncropped 16:9 photos. Wash behind tiles. Kit-type chips on this screen. Search field in this header.

Flag missing context; do not invent patterns.

### Collection shortcuts (genveje)

**Purpose**: Filter the owner’s collection to a saved AND of catalog facets, without putting kit type on Samling.

**Composition**:
1. Chip row: **Alle** (default, always first, always remains selected after creating a genvej) + zero or more named shortcuts. Trailing **Tilpas** text, never a plus.
2. Hide the whole row when the collection has zero jerseys.
3. Tilpas opens Sheet `form` **Genveje**: List row `manage` (drag-handle, name, count, edit, delete) + footer `primary` **Tilføj**. Reorder affordance is the drag-handle; do not treat the throwaway prototype’s up/down buttons as the lock.
4. Tilføj / edit swaps the **same** Sheet body to **Ny genvej**: Select fields for country, league, club, player; optional Text field for a custom name; helper that facets combine with **AND** (`type.body` or `caption`). Default name = labels of set facets. `primary` **Gem** disabled until at least one facet is set.
5. Each Select field opens a **full-screen** searchable picker (back + close): Search field, optional “Mest brugte”, List row `select` + Mark. One overlay on the Sheet — not a nested Sheet.
6. After Gem: dismiss form (back to list or close); **Alle stays the active chip**. Do not auto-select the new shortcut.
7. Active shortcut filters the grid: all set facets must match (AND). Alle shows the full collection.

**Unsupported**: Opening this flow from tab-bar plus. Kit type as a Samling chip. Auto-focusing the new chip. Public Astro genveje. A sixth tab named Genveje.

Flag missing context; do not invent patterns.

### Inbox

**Purpose**: Collector-to-collector messages. A bud creates a thread; it is not checkout.

**Composition**:
1. Header title **Indbakke** (`title`). No Samling bell here.
2. Top tabs **Beskeder** | **Aktivitet** (shared unread model — one conversation behind both).
3. Beskeder: Thread rows. Aktivitet: Activity cards. Either empty: Empty state `inbox` (no fake rows).
4. Tab bar visible; slot 4 selected; badge = unread conversation count.
5. Tap row or card → Samtale (Tab bar hides). Overflow on Samtale → Detaljer (Tab bar stays hidden).
6. Wide ≥1024: list column + conversation (Layout). Same components.

**Unsupported**: Marketplace listing UI. Two unread models. Heart/Ønske as this place. Help. Prototype switcher chrome.

Flag missing context; do not invent patterns.

### Conversation

**Purpose**: Read and reply in one thread, including bud accept/decline.

**Composition**: Back (to Indbakke) + handle (`heading-sm`) + optional one-line jersey context (`mono`: club · season · type) + overflow Icon button “Detaljer”. Column: centered dates, Bid cards, Chat bubbles (`incoming` left = them, `outgoing` right = me). Message composer pinned. No Tab bar. Dark mode uses the same roles (4d) — not a third palette.

**Unsupported**: Left = me. Tab bar. Payment. Wash bubbles. Leaving Peer Profil reachable only as a dead Detaljer stub.

Flag missing context; do not invent patterns.

### Conversation details

**Purpose**: Safety actions for one thread, plus entry to Peer Profil.

**Composition**: Canvas `fill.secondary`. Groups on `surface`, `radius.md`. First group: List row `navigate` (Avatar `md` or 44 circular initial if Avatar not loaded + handle + `mono` “{n} trøjer · {city}” + chevron) → **Peer Profil**. Second group: List row `danger` Rapportér, Blokér. Third group: List row `danger` Slet samtale (alone). Helper caption: blocking hides the thread for both; delete removes it only for you. No Help. No Tab bar.

**Unsupported**: Help. A fourth group of settings. Inventing jersey count/city if the host has no data — flag. Non-navigating first row.

Flag missing context; do not invent patterns.

### Own Profil

**Purpose**: Own-collector identity, favorites, and settings live under the Profil tab — list + drill, not a control panel and not a marketplace account hub.

**Composition**:
1. **Home (5a)** — Header title **Profil** (`title`). Canvas `fill.secondary`. Three `surface` groups (`radius.md`):
   - Identity card: Avatar `lg` + username (`heading-sm`) + location `mono` (`{city} · {country}` when “Vis by” is on; country only when off) + Button `secondary` **Rediger profil** (hit target ≥ 44; do not copy the hi-fi’s 36px height). The card is not a List row.
   - Favoritter: List row `navigate`, leading `icon`, meta `{n} trøjer`, trailing `chevron`.
   - Indstillinger + Cookie-indstillinger: two `navigate` rows, leading `icon`, trailing `chevron`.
   Nothing else on home: no debug line, no balance, no orders, no Help, no legal. Last group clears the Tab bar. Tab bar **visible**; person slot selected.
2. **Rediger profil** — Back + title + trailing `primary` text **Gem**. Canvas `fill.secondary`. “Skift foto”: List row leading `avatar` `md`. Text field username (helper states locked on Text field). Text field About me (multiline). Location row `navigate` (title “Min lokation”, meta city/country). “Vis by på profil”: trailing `switch` + helper under the title. Tab bar hidden. No gender field.
3. **Min lokation** — Country list first (fixture list this gap; live geocoding is not in this lock). Current country: `mono` meta “Nuværende” + `chevron`. No flags, no map. Then city: Search field `city` + “Populære byer · {country}”. Selected city: trailing `check` (no chevron). No match: one `navigate` row **Brug «{query}»** with helper that it saves as a free tag — not an error. Tab bar hidden.
4. **Favoritter** — Back + title. Two-column Jersey tiles (same 4:5 + caption as Samling). No price, no heart overlay, no owner handle on the tile. Empty: Empty state with honest body; **flag** the action if the host needs one — do not invent a `primary` that starts a chat. Tab bar hidden. Tap tile → foreign UserJersey detail.
5. **Indstillinger hub** — Back + title. Four groups with `mono` section labels:
   - Profiloplysninger / Kontoindstillinger (`navigate`)
   - Push-notifikationer / E-mail-notifikationer (`navigate`)
   - Sprog (meta current language + `chevron`) / Mørk tilstand (meta current appearance + `chevron`)
   - Privatlivsindstillinger (`navigate`) + List row `danger` **Log ud** (icon + label, no chevron)
   Tab bar hidden.
6. **Leaves** — Account (email/phone with trailing `action` “Skift”; birthday as a value + `chevron`; linked accounts; Skift adgangskode; Slet min konto). Push (grouped switches; master “Slå push til” in its **own last group**; off dims the other groups to 40%). Email (Nyheder off by default; high-priority on). Privacy (switches + one `navigate` “Administrer kontodata”). Sprog and Mørk tilstand are the **same** `select` list: selected row trailing `check` in `fill.primary`, unselected rows `chevron` or empty — do not show the word “Valgt” and a chevron together. Appearance options: System / Light / Dark (hub meta “Systemindstilling” when system). Daily-limit and birthday **picker chrome** are not locked — flag; do not invent a calendar or stepper.
7. **Log ud / Slet min konto** — Sheet `confirm` (`radius.lg`, scrim). Title + consequence + dock `destructive` + `tertiary` Annuller. Not a full-screen place.
8. **Cookie-indstillinger** — Grouped consent: necessary = `mono` “Altid aktive” (no Switch). Analysis and marketing = Switch. Button dock: `primary` **Acceptér alle**, `secondary` **Kun nødvendige**, `tertiary` **Bekræft mine valg**. No legal essay. Tab bar hidden.

**Unsupported**: Marketplace account chrome (listings, payments, postage, Help, About, legal as primary rows). Gender. Control-panel accordions (prototype C). Hero + Sheet (prototype B). Tab bar on drills. KC monogram as Avatar. `#0B0B0B` as a new dark canvas. Success-green uniqueness. Prototype switcher. Copying `prototype-profile/` as the host API. Treating Peer Profil as a settings mirror of this pattern.

Flag missing context; do not invent patterns.

### Peer Profil

**Purpose**: View another collector — identity plus their visible (non-private) UserJerseys. Not own settings.

**Composition** — Gap 2026-08-31 prototype **A** (card + grid). Back + title **Profil** (Handle-as-title still flagged if both are needed). Canvas `fill.secondary`. Identity **card** (`surface`, `radius.md`): Avatar `lg`, handle (`heading-sm`), location `mono` per Vis by, About me when present. **No** Rediger profil, Indstillinger, or Cookie rows. Below: section optional + **two-column Jersey tile grid** (same 4:5 + caption as Samling / Favoritter). Empty: Empty state honest body — flag CTA; do not invent “Send besked” without a jersey. Overflow Icon button: Rapportér / Blokér. Tab bar **hidden**. Tap tile → foreign UserJersey detail (immersive Pattern).

**Unsupported**: Own settings chrome. Showing private copies. Their Favoritter. Price/bud overlay on tiles. KitPhoto. Tab bar. Compact bleed grid (prototype B). Hero-band + single feed (prototype C). Dead Detaljer stub as the only peer surface.

Flag missing context; do not invent patterns.

### UserJersey detail

**Purpose**: Full-screen view of one UserJersey — own manage/edit, or foreign browse before Send bud / Favorit.

**Composition (shared)** — Gap 2026-08-31 prototype **B** (immersive pager + sheet). Tab bar **hidden**. Back (and foreign: Favorit + overflow) sit as chrome over a **full-bleed photo stage** (4:5 crop of the active photo; pager dots when more than one photo). Meta and actions live in a **bottom sheet** over the stage (`surface`, `radius.lg` top corners) — not a hero tile + strip + long page scroll as the primary layout. No price overlay. No KitPhoto. No bud amount field here.

**Own (sheet body)**: Club (`heading-sm`), season · type · size · condition (`mono`). Switch rows: **Privat**; **Åben for bud** (Privat on clears and disables bud — helper). Button `secondary` **Rediger** (Confirm UI as edit / patch). **Slet** via Sheet `confirm` (nested confirm is allowed for destructive — flag if host cannot stack). No Send bud. No Favorit.

**Foreign (sheet body)**: Same meta. Owner row `navigate` → Peer Profil. Favorit may also sit in top chrome over the stage (prototype B). When åben for bud: Button `primary` **Send bud** → Send bud stack screen. When closed: no Send bud CTA — flag helper copy. Overflow: Rapportér / Blokér. Private copies are not shown.

**Unsupported**: Send bud as the only foreign view. Hero + strip as the locked primary layout (prototype A). Meta-first gallery (prototype C). Bud amount on this screen. Marketplace boost. Editing someone else’s fields. Wash on the photo stage. Tab bar. Copying the prototype HTML as host API.

Flag missing context; do not invent patterns.

### Søg

**Purpose**: Compass place — discover other collectors’ non-private UserJerseys and open Club / Kit / Player drills or Peer Profil. Free of Entitlement (ADR-0035).

**Composition**:
1. **Home (no query)** — Title **Søg**. Search field. Magazine shelves in fixed order; **hide a shelf when empty**:
   1. **Klubber** — horizontal Mark scroll → Club catalog drill.
   2. **Åbne for bud** — horizontal 4:5 tiles (bidding-enabled only). **Only** bud signal on Søg home — no Bud badge on Flere trøjer.
   3. **Samlere** — horizontal Avatar/initial scroll → Peer Profil.
   4. **Flere trøjer** — two-column Jersey tile grid → foreign UserJersey detail.
   Tab bar visible; compass active.
2. **Typeahead (query)** — Replace the magazine body (not an overlay). Sectioned List rows: Klubber, Kits, Spillere, Samlere; optional matching jersey grid. Clear restores magazine.
3. Blocked peers omitted everywhere.

**Unsupported**: Trøjer|Katalog|Samlere home tabs. Grid-only home as the lock. Bud badge on Flere trøjer. KitPhoto. Own-Samling find as Søg’s job. Paywall. Copying `.scratch/soeg-browse/prototype/` into product.

Flag missing context; do not invent patterns.

### Søg catalog drill

**Purpose**: Stamdata landing under Søg for Club, Kit, or Player — visible copies for that grain.

**Composition**: Back + `title` (CatalogLabel) + Mark `md` + `mono` “{n} trøjer”. Two-column Jersey tile grid (Kit: only `catalogKitId` set). Tap → foreign UserJersey detail. Tab bar visible; compass active. No KitPhoto. No wash hero. No League/Season/NationalTeam landings this gap.

**Unsupported**: Archive renders. Admin table chrome. Unknown-Kit bucket. Hiding Tab bar here.

Flag missing context; do not invent patterns.

### Send bid

**Purpose**: Start a bud on **another** collector’s UserJersey. Lands as a message in their Indbakke.

**Composition**: Lives under **Søg** (compass active). Entry from foreign UserJersey detail CTA (or deep link). Back + title **Send bud**. 4:5 photo (`radius.md`) + club (`heading-sm`) + season · type (`mono`) + owner initial + handle. Text field “Dit bud” with `kr` suffix, focus `border.strong`. Helper: last bid when known (`mono`). Button `primary` **Send bud**. Caption: not a purchase. Tab bar visible.

**Unsupported**: Entry from **own** Samling tiles. Price overlay on the photo. Cart. “Køb nu”. Wash focus. Compose-to-nobody from Indbakke. Amount field inside UserJersey detail.

Flag missing context; do not invent patterns.

### Confirm and Save

**Purpose**: Attach photos to catalog identity and save without a wizard. Jersey #2 stays under 45 seconds because every field Save requires is on this screen, and nothing Save does not require sits in front of **Gem**.

**Composition** (one scrolling column, `mobile` only; same body for a single jersey and for each active jersey in bulk):

1. Photo slot `confirm-strip` (Forside / Bagside / Mærke). At least one filled. Roles stay three; do not add left/right/other slots.
2. Vision suggestion on this jersey only — club, season, kit type. High confidence **pre-selects** the matching Search/Select/Chip. Low confidence: a quiet strip with **Brug** + dismiss. In-flight: skeleton on existing `surface` / `content` tokens, not a blocking “analysing” screen. Failure: the strip disappears; the collector types. Save never waits. Vision does **not** group photos into UserJerseys and does **not** assign Photo slot roles.
3. Club Search field → Sheet + List row + Mark. Season is club-scoped (Select). No free-text club.
4. Chip `single-select` groups, all visible here: kit type (Hjemme / Ude / Tredje / Keeper / Special), size (XS–XXL), condition (Ny / Brugt / Slidt). Thumb-reach; not free text; not stars.
5. Tertiary text **Flere detaljer** opens Sheet `form` (not a second place, not Top tabs). That Sheet holds nameset / player print, patches, purchase, notes, authenticity. Authenticity stays `unknown` unless they open this and pick. Do not ask authenticity on the 45-second path.
6. Tertiary text **Flere trøjer i denne upload** escapes to bulk bind without re-picking photos. It does not “split” the current jersey.
7. Button dock: one `primary` **Gem** (`width.fill`). Disabled until photo + club + season + type + size + condition are set. Helper text explains what is missing — do not leave a black button that 4xxs. When more than one unsaved jersey remains in the session, the label is **Gem og næste**; the enablement rule does not change.

**Bulk chrome** (only when the session has more than three photos — see Capture session): a thin **Uredigerede** row (count, no essay) + jersey tabs (Trøje *n* · count, **+ trøje**) sit **above** this same body. The active tab is the bind target. The unbound row hides when empty. Do not ship a thinner bulk form that drops size or condition.

**Defaults**: “Ny trøje” does not inherit club. “Samme klub” prefills club only — not season, type, or condition. Size is not a sticky default in this gap (measure first; flag if an agent wants last-used size).

**Unsupported**: Stamdata | Detaljer (or any Confirm tabs). Admin Top tabs reused on Confirm. Multi-step stepper. Shirt Squad field completeness before the row exists. Prefilling club on “Ny trøje”. Free-text club. Blocking on manufacturer, `catalogKitId`, or kit completeness. Star ratings for condition. A “Mere” type chip that hides Keeper/Special. Required size or condition only on a second surface. Vision as grouping. An extra **Brug** on every high-confidence hit. Two different Save-enablement rules for single vs bulk. Green success confetti; a toast on top of **Gemt**.

**Example** *(not a rule)*: Three 4:5 thumbs, Vision has already selected F.C. København / 2023/24 / Hjemme, collector taps L and Brugt, **Gem** enables. Player and Superliga patch stay behind Flere detaljer.

Flag missing context; do not invent patterns.

### Capture session

**Purpose**: Fill Photo slots, then land on Confirm and Save. Plus starts this flow; it is not a tab named Add.

**Composition**:

1. **Chooser** (after plus): title **Tilføj trøje**. Primary **Upload filer** (system picker: iOS Photos and Files / Android gallery and documents). Secondary **Tag billede** (in-app `CameraView` on repeat; gallery-first remains true for the first session). One short caption: few photos become one jersey; many land as an unbound row the collector binds. Close/X exits. Tab bar is hidden.
2. **System picker**: the OS screen, not an in-app camera roll. iOS may show numbered ordered selection; Android typically does not — bind and Confirm must not assume the collector saw 1, 2, 3. Confirm the pick with **Brug *n* billeder**.
3. **Branch**: three photos or fewer → Confirm and Save for one UserJersey (picker order fills roles front, back, label when present). More than three → bulk bind first (Uredigerede + jersey tabs), then the same Confirm body per active jersey. Do not auto-chunk every three photos.
4. **Repeat camera**: one `CameraView`, three Photo slots overlaid, gallery as text/tertiary escape. Persist the draft locally after each shot or pick.

**Unsupported**: System camera one-shot as the repeat primary path. Asking camera + photos + push on first launch. A custom product photo grid as the picker. Vision grouping photos into jerseys. Groups-of-three as the product. Showing the Tab bar while this session is open.

Flag missing context; do not invent patterns.

### Admin shell

**Purpose**: Operator chrome for scanning master data or user data.

**Composition**: App header (wordmark-black + Search field `admin` with leading icon + Icon buttons pin / notifications / help / waffle + Profile action) + toolbar (entity Chips + `caption` count) + Data table (or Empty state `table`). Waffle opens exactly two tiles, icon above title: **Master Data** (`/stamdata`) and **User Data** (`/collectors`). Master Data toolbar chips: Clubs, Seasons, Club seasons, Kits, plus Filters as a Chip in the same group (opens Filters Sheet; pressed when catalog filters are on). User Data toolbar chips: Users, Jerseys — same Chip language. Profile action is a 32px circular monogram from operator email + chevron; menu is email + Sign out — not a User avatar primitive and not the KC monogram. Pin / notifications / help open empty menus this gap. Filters Sheet `form` contains Chip `filter` groups: country, league, season, kit type, has photo. Login is a separate centered 400px card (lockup-black + Text field email/password + Button `primary` “Sign in”) — not this shell.

**Unsupported**: “+ New”. Bulk checkboxes. Bottom Tab bar. Split-view detail. Zebra. Danish chrome. Dark canvas. Peek HTML as a pane inside the shell.

Flag missing context; do not invent patterns.

### Admin drill

**Purpose**: Show one row’s evidence and the allowed mutations.

**Composition**: Icon button “Back” + `title` + evidence (KitPhoto or UserJersey photos, not 4:5 collection grid as the page layout) + meta (`type.body` / `type.caption`). User drill: promote/demote as Button `secondary` (disabled with helper text for self or last admin). UserJersey drill: Take-down as Button `destructive`. Both destructive paths open Sheet `confirm` before the mutation. Squad on a **club–season** drill is count + expand, not a global Players table.

**Club drill**: identity/details strip (Country, Kind, Valid from, Valid to, Successor when present) with Mark `md` on the **right** as the crest stand-in — no invented crest asset. Below: underline tabs **Players** | **Jerseys** (same Top tabs anatomy) with a native labelled Season `<select>` aligned to the **right** of that tab row. The Data table under the tabs lists that club’s squad or kits for the selected season (club-scoped lists, not a new primary Players stamdata table). Keep `<thead>` on loading and empty. Jersey rows open kit drill. Player rows do not navigate (no player drill).

**Unsupported**: Editing CatalogLabel or Kit identity. Setting `rights: public`. Bulk take-down. Demoting self or the last admin. Showing KitPhoto on a collector-facing surface from this page. A global Players stamdata table. Left sidebar. “+ New”. Invented crest artwork. Chip-tabs or waffle tiles for Players | Jerseys. Using the mobile Select field (facet picker) as the season control — club drill uses a native labelled `<select>`.

Flag missing context; do not invent patterns.

## Design–code alignment

Status: `thin` — `apps/admin` is not scaffolded; mobile/web mappings may still be thin. Mapping is “flag until named”, not a license to invent APIs.

| Decision | Surface | Code name | Notes / exceptions |
| --- | --- | --- | --- |
| Color / type / space tokens | mobile | *unmapped* | Expo: load Archivo + IBM Plex Sans + IBM Plex Mono; sizes in Typography. Flag host file until named |
| Color / type / space tokens | web | *unmapped* | CSS variables on Astro; same families |
| Color / type / space tokens | admin | *unmapped* | Vite + React; light aliases only; same families — flag until named |
| Button … Banner | mobile | *unmapped* | One component per inventory name |
| Data table, Top tabs | admin | *unmapped* | Do not reuse Tab bar or Jersey tile |
| Jersey tile | web | *unmapped* | Same 4:5 crop and caption rules |
| Identity wash | mobile, web | *unmapped* | Gradient; never on `KitPhoto` or jersey photo |
| Tab bar | mobile | *unmapped* | Five icon-only slots in a glass pill; plus → capture; slot 4 envelope + `unreadCount`; hide on capture, Samtale, Detaljer, own-Profil drills; show on Profil home |
| Thread row … Message composer | mobile | *unmapped* | Inbox gap primitives; throwaway `src/prototype-inbox/` is not the host API |
| Switch, Avatar | mobile | *unmapped* | Profil gap primitives; throwaway `src/prototype-profile/` is not the host API |
| Catalog peek | api | `GET /v1/catalog/peek` | Not in this system |
| OG canvas | web | *unmapped* | 1200×630; letterbox 4:5; wash top strip only |
| KitPhoto render | admin | *unmapped* | 32px table thumb + drill; never Expo/Astro/OG |
| Logo files | admin | `public/assets/kitcollective-*.svg` | Wordmark-black in header (`BrandLogo`); lockup-black on login; favicon. White variants not used (light only). |
| Logo files | mobile | `assets/brand/kitcollective-*.svg` | Files landed. Login/splash/icon wiring flagged: Expo icons need PNG; no `react-native-svg` this gap. |
| Logo files | web | *no host* | `apps/web` does not exist this gap. OG placement is locked; do not invent a web app to hold the files. |

**Behavior parity**: Save, gallery-first vs camera-repeat, and “no archive renders” on collector surfaces are product rules (`CONTEXT.md` + this file), not platform exceptions. Admin may render KitPhoto. Staff access, Take-down, and English chrome are product rules, not visual exceptions.

**Collection chrome source**: The 3a artifact (`.scratch/collection-main-screen/claude-design/KitCollective-samling-og-genveje-3a.html`) is the visual reference for Samling chrome **except** Genveje is a **Sheet**, not a full-screen place. Brand book v1.0 is type + logo construction only. Tilføj trøje hi-fi (`.scratch/jersey-upload/claude-design/`) is capture-spine evidence (chooser, OS picker, bind, Gemt). **Confirm body is this file** — do not copy Stamdata | Detaljer tabs, star condition, or a “Mere” type chip from that artifact. Indbakke hi-fi (`.scratch/inbox/claude-design/KitCollective-indbakke.html`, frames 4a–4i) is the visual reference for inbox chrome; wireframe PNGs in that folder are IA only. Own Profil hi-fi (`.scratch/profile-settings/claude-design/KitCollective-profil.html`, frames 5a–5o) is the visual reference for own-collector Profil chrome; wireframe PNGs in that folder are IA only. `apps/mobile/src/prototype/`, `apps/mobile/src/prototype-inbox/`, and `apps/mobile/src/prototype-profile/` are throwaway evidence of feel — not a host contract and not copy-paste UI.

**Supported exceptions**: System photo picker, system share sheet, OS keyboard. Fonts: brand webfonts first; system-ui fallback if load fails. Native sheet chrome if colors and radius still match. Admin 32×32 icon actions (named). Admin light-only. Genveje manager uses platform Sheet; facet picker may be a full-screen overlay.

Flag missing context; do not invent APIs or behavior.

## Using this file

1. Read Goals, Principles, and Scope before any screen.
2. Choose existing tokens and components. Compose patterns only as documented.
3. If the screen needs a decision this file does not contain: **flag it**. Do not fill the gap with taste.
4. Platform exceptions live in Design–code alignment, not as one-off values in a component.
5. Root `DESIGN.md` is the token snapshot (Google Labs format). Do not treat it as a second set of product rules.

Flag missing context; do not invent values, tokens, variants, or rules.

## Deferred

| Area | Why now | Revisit when |
| --- | --- | --- |
| Design–code host names | `apps/admin` is not scaffolded; mobile/web mappings may still be thin | First slice on that surface maps tokens here |
| Admin dark mode | Light-only this gap | A later Gap pass if operators need it |
| Scoped staff-role chrome | Binary `role=admin` only | When permissions exist |
| Catalog-create / “+ New” | Seed remains the stamdata writer | A later admin mutation feature |
| KC mark on Profil header | Not chosen this gap | A later collector-chrome pass |
| Wash variants 2–3 | No named job | A taxonomy (e.g. kit type) needs distinction |
| Crest / badge / portrait files | Rights and assets missing | Stamdata has approved marks |
| Adopt / Evolve roadmap areas | First lock | A later Gap pass |
| Expo Web as first-class | Degraded by stack lock | If Expo Web ships as a real surface — 4i layout already exists |
| Ønske place **content** and **placement** | Wishlist shipped; paywall title words may still flag | Wishlist polish / copy pass |
| Other-collector Profil beyond Detaljer stub | **Superseded** — Peer Profil locked Gap 2026-08-31 | — |
| Søg magazine / catalog drills / UserJersey detail | **Superseded** — locked Gap 2026-08-31 | — |
| League / Season / NationalTeam Søg landings | Out of this gap | Later Søg catalog expansion |
| Collector gender field | Excluded this gap; nothing in the product uses it | If a slice needs gender as data |
| Daily-limit and birthday picker chrome | Values/rows locked; calendar/stepper not drawn | Account / push feature slice |
| Empty Favoritter action | Honest empty body locked; CTA not drawn | If Favoritter can be zero at ship |
| Android Message composer chrome | One iOS-adjacent contract; OS keyboard is the exception | If Android send/attach must diverge |
| Tab-badge overflow (99+) | Integer count locked; cap not chosen | If unread can exceed two digits |
| Sticky last-used size on Confirm | Wrong-default risk; no telemetry | After cellar sessions show the same collector reuses size |
| Nameset / patch / player-print controls | Flere detaljer Sheet is locked; field UI is not | Nameset / patch feature slice |
