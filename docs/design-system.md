# Design system

AI-ready visual and interaction lock for in-scope surfaces.
Agents apply this file. Flag missing context; do not invent values, tokens, variants, or rules.

**Surfaces in scope**: `mobile` (deep), `web` (thin, share/OG), `admin` (operator dashboard). `api` is out of this lock.
**Modes**: Lock 2026-08-22. Gap 2026-08-23 (`admin`). Gap 2026-08-23 (`mobile` collection chrome + brand type). Light is the default canvas. Dark is a full token mode on `mobile` and `web` that follows the system appearance. `admin` is **light only** this gap — do not invent a dark admin canvas.
**Owner**: Nicklas

**Taste (locked)**: Vinted for layout and scanability (grid, short captions, search, chips, tab bar) — not for marketplace mechanics. Uber Base for grayscale structure, components, and quiet motion — not for copying UberMove or importing Base Web. One cyan→violet identity wash as garnish, Premier League Fantasy–adjacent, never as chrome that competes with a jersey photo.

**Taste (`admin`, locked this gap)**: Same Base grayscale family, operator density. Uber Base dashboard (top search, underline tabs, Filters, hairline table) is the north star — not Vinted’s collection grid, not Catalog peek, not Base Web as a dependency, not a “+ New” create affordance in this increment. Photos are evidence (32px square thumb in Kit and UserJersey rows, full image on drill), not the layout. Chrome in English (ADR-0019).

**Anti-references**: Shirt Squad field wizards; Vinted buy/sell/price/boost/teal CTA; newbie primary/secondary palettes; emoji as icons; archive `KitPhoto` JPEGs as club marks; Fantasy-style gradient fills behind product photos; zebra-striped tables; 4:5 tile grid as the admin home.

## Goals

Status: `locked`

**Problem**: Collectors have no serious place to register and scan a football-shirt collection. Operators have Catalog peek without photos, users, or navigation. Implementing agents have no visual lock, so they invent taste. Collectors fail as slow capture and noisy chrome; operators fail as a spreadsheet the agent styled.

**Audience**: Nordic collectors (Denmark first, then Sweden and Norway) on `mobile` and `web`. Staff access on `admin`. Implementing agents composing Expo, Astro, and Admin SPA screens.

**Outcomes**: Jersey #2 in under 45 seconds. The collection scans as a photo grid, not a spreadsheet. A public Astro link looks like the same product when pasted into a Facebook group. On `admin`, an operator can search and filter stamdata, see KitPhoto, and take down one UserJersey without invented chrome. Missing decisions are flagged, not filled with taste.

**Evidence**: Product PRD (`.scratch/Business/PRD.md`) UX principles; registration-speed research (`.scratch/Research/jersey-registration-speed.md`); lock interview (Vinted IA + Base grayscale + one wash); Gap 2026-08-23 (Uber Base dashboard refs + grill: Staff access, Take-down, ADR-0018, ADR-0019); Gap 2026-08-23 brand book v1.0 (`.scratch/collection-main-screen/claude-design/KitCollective-brand-book-v1.html`) for type families and scale; collection 3a artifact for Samling chrome (`.scratch/collection-main-screen/claude-design/KitCollective-samling-og-genveje-3a.html`).

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
- **When it collides**: Extra fields yield to time-to-Save.
- **Follow**: Club search, club-scoped season, chips for type / size / condition; nameset and purchase behind “More details”. Save does not wait on Vision.
- **Violate**: A Shirt Squad–style twelve-step form before the row exists.
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
- `mobile` (Expo, iOS/Android): collection grid, empty state, add / confirm / Save, gallery-first onboarding and camera-on-repeat, search as its own place (Søg tab, not in the collection header), genveje chips + Tilpas (Sheet manager, not a tab), floating icon-only tab bar (Samling · Søg · Tilføj trøje · Ønske · Profil).
- `web` (Astro): public collection page, single UserJersey page, Open Graph image and title — same tokens so a shared link is recognisably KitCollective. Thin: no login mutations, no capture UI.
- `admin` (Vite + React SPA): email/password login (same Identity); underline tabs **Stamdata** | **Collectors**; search + Filters; hairline data table; 32px square thumb on Kit and UserJersey rows; Mark/monogram on club, season, and user identity rows; row drill; Take-down confirm; promote/demote with last-admin and self-demote guards. English chrome. Light only. KitPhoto may render here.

**Excluded** (with reason):
- `api` and catalog peek (`GET /v1/catalog/peek`): unstyled Nest HTML, not product UI (ADR-0016). Peek is not retired by this gap.
- Marketplace listing chrome (price, buy, boost, ratings on cards): product is a catalog, not Vinted-the-marketplace.
- Archive `KitPhoto` bytes on Expo, Astro, or OG: `admin_only` until rights are resolved.
- Emoji as icons or category marks.
- Importing Base Web (or cloning UberMove / Michelangelo Studio chrome).
- Bulk row actions and a “+ New” catalog-create control.
- Zebra-striped tables. 4:5 collection grid as the admin home.

**Deferred** (with reason):
- `admin` dark mode: this gap is light only; flag, do not invent.
- Scoped staff roles UI (moderator who cannot see everything).
- Catalog writes (labels, Kit create/edit, `rights: public`).
- Players as a primary admin table (squad stays count + expand on club–season).
- Ønske **content** (list, filters) and IAP paywall. The Ønske **tab** is locked; do not invent a wishlist row primitive.
- Expo Web as a first-class surface.
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
**Review / escalation**: Agents apply this file and flag gaps. Unresolved visual disagreement goes to Nicklas, not a new principle in a PR. Admin dark mode, “+ New”, and zebra rows are out of this gap — flag them; do not invent.

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

**Constraints**: Text and essential controls meet WCAG AA against their surface. Color is never the only error or selected signal. `identity.wash` is forbidden: behind a jersey photo, on body text, on a primary CTA, as success/warning/danger/info. Wash variants 2 and 3 are deferred. `admin` uses the **light** aliases only — do not apply dark semantic aliases on that surface.

**Example** *(not a rule)*: Collection screen `canvas`; jersey tile `surface` with photo full-bleed inside the radius; caption `content.secondary`; **Save** `fill.primary`. Admin table hover/selected row: `fill.secondary` on `canvas`, not zebra and not `identity.wash`.

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

Status: `locked` (Gap 2026-08-23: collection home regions = 3a). Chip row = genveje (Chip / Collection shortcuts). Brand-book Hjemme/Ude on Samling is **not** layout.

**Purpose**: A Vinted-like scan of owned jerseys on `mobile` / `web`. Add is capture, not a listing. Public web is the same product at read-only depth. `admin` is a Base dashboard: table, search, filters; photos are evidence, not the layout.

**Regions (mobile)**:
| Region | Meaning |
| --- | --- |
| Screen | Full viewport plus safe-area insets |
| Header | Collection home: title **Samling** (`display` 28) + count (`mono`) + notification Icon button. No search, no profile, no wordmark, no KC mark |
| Body | Collection grid or confirm form. Chip row **under** the header when the collection is not empty (Collection shortcuts). Grid scrolls; last rows must clear the floating tab bar |
| Footer actions | Primary/secondary buttons for the current task; pinned **Button dock** at the bottom on login, register, confirm, and empty collection |
| Tab bar | Floating glass pill **above** the home indicator / safe-area inset. Five icon-only slots (Tab bar). Content may show through behind it. Not a full-width labeled dock |

**Usage (mobile)**: Collection body is a **two-column** photo grid on phone. Jersey photos on tiles are cropped **4:5**. Caption under the photo: club (`heading-sm`) then season · type (`mono`). **Search is not in the collection header** — it is the Søg place (compass slot). Collection chips are **genveje**, not kit type (kit type stays on Confirm). **Tilføj trøje** (raised plus) opens the photo flow (gallery-first on first session, camera-first on repeat), not the overview, not “new shortcut”, and not a marketplace compose screen. “Same club” vs “New jersey” is a choice after Save, not inherited identity on **New**. Other collector screens (Søg, Ønske, Profil) use `title` 24 in the header unless a later lock says otherwise. Genveje manager is a **Sheet**, not a titled full-screen place.

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
| App header | Product name left. Not a marketing hero. No “+ New”. |
| Top tabs | Underline tabs: Stamdata \| Collectors |
| Toolbar | Search field + Filters control. Record count as `caption`. |
| Body | Data table, full remaining width |
| Drill | Full page replacing the table, with back |
| Confirm | Sheet/dialog over the drill (Take-down, demote) |
| Login | Centered `surface` card, max-width **400px** |

**Usage (admin)**: Desktop-first. Page inset `space.inset.lg` (24px). Content is **full width** of the viewport minus inset — not the Astro 960px column. Table row height **48px**. Hairline row dividers (`border.subtle`). Hover and selected row use `fill.secondary`. Kit and UserJersey rows include a **32×32** square thumb (`radius.sm`); missing photo = empty 32px slot, not a crest invented from `KitPhoto`. Club, season, and user identity rows use Mark/monogram, not a KitPhoto thumb. Click row → full-page drill with back. Take-down and demote confirm in a Sheet (`confirm`) over that page. Below **1024px**: table scrolls horizontally; do not invent a phone admin layout. No split-view detail pane. No zebra. No bulk checkboxes.

**Relationships**: Grid gap is `space.gap.md`. Page inset is `space.inset.md` on `mobile` / `web` and `space.inset.lg` on `admin`. Cards use `radius.md` and `surface`. Type roles from Typography. Logo placement from Logo. Admin table cells use `type.body` for the primary label and `type.caption` for column headers and meta. Floating tab bar is chrome on canvas (Elevation), not `elevation.overlay`.

**Constraints**: No price, buy, boost, or ratings on a collection card. No teal (or wash) primary in the tab bar. Tab bar Add is capture, never “new shortcut”. Safe-area insets are required on `mobile`. Body must reserve space for the pill + inset so tiles are not hidden — do not invent a named pixel token for that reserve; flag if a host needs a named constant. Content must reflow; do not hard-code a pixel width for the **mobile** grid (columns are 2, tiles flex). Do not invent a fifth desktop column. Do not invent an admin split-view, zebra, “+ New”, or a 4:5 admin home. Brand-book mocks with wordmark header or labeled flush tabs are **not** layout.

**Example** *(not a rule)*: iPhone Samling: “Samling” + “8” + bell; two 4:5 tiles per row; glass pill overlapping the bottom of the grid. Astro collection at 800px viewport shows two columns inside 960px. Admin Stamdata at 1280px: full-width table of kits with 32px thumbs, Filters in the toolbar, click a row to a drill page.

**Exceptions**: Confirm/Save is a single column. Camera session is full-bleed preview with three slots overlaid, not a grid. Capture does not crop while shooting. OG letterboxes a 4:5 photo on 1200×630 — do not crop the jersey to 16:9. Admin login is a centered 400px card, not full-width. Public Astro has no floating tab bar.

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
| `title` | Archivo | 24px | 600 | 29px | −2% | Other screen titles (Søg, Ønske, Profil, Genveje, Ny genvej) |
| `section` | Archivo | 20px | 600 | 25px | −2% | Mid headings (picker title if not using `title`; empty-state title) |
| `heading-sm` | Archivo | 15px | 600 | 20px | −2% | Club name on a Jersey tile |
| `body` | IBM Plex Sans | 16px | 400 | 25px | 0 | Paragraphs, empty-state body, helper copy |
| `label` | IBM Plex Sans | 13px–16px | 500 | 18px (13) / 20px (16) | 0–0.01em | Buttons (16), chips (14), field labels (13) |
| `caption` | IBM Plex Sans | 12px–13px | 400 | 18px | 0 | Non-data meta; admin column headers |
| `mono` | IBM Plex Mono | 12px–14px | 400 | 18px (12) / 20px (14) | 0 | Season, kit type, size, collection count, IDs |

There is no extra 14px admin-only family. Admin uses the same roles; chrome in English.

**Usage**: One role per line of UI text. Collection tile is **two lines**: `heading-sm` club, then `mono` season · type. Do not join club and season into one `caption` string. Do not use `caption` as a button label. Do not use `display`/`title` inside a tile. On `admin`, the row’s primary name is `body`; headers and secondary columns are `caption` or `mono` when the cell is a season/ID.

**Relationships**: Title + supporting line stacks use `space.gap.sm`. Count beside “Samling” is `mono` 13px, muted. Label sits in buttons/chips with `space.inset` from Spacing. Wordmark and KC mark construction lives in the brand book; **where they appear** is Foundations → Logo.

**Constraints**: Body is at least 16px on `mobile` (`body`). Body and label follow Dynamic Type / font scaling; display/title/heading-sm may scale but must not blow the tab bar or two-column grid. Text is never the only state signal. WCAG AA against the surface. Brand book accent `#1F5EFF` is **not** a type color and is **not** this gap’s primary CTA — primary fill stays black.

**Example** *(not a rule)*: Collection home: Archivo `display` 28 “Samling” + Plex Mono “8”. Tile: Archivo `heading-sm` “F.C. København”; Mono “2023/24 · Hjemme”. Empty state title: `section`. Form helper: `body` or `caption`.

**Exceptions**: Legal / App Store fine print may use `caption`. System share sheets use OS type. If a webfont fails to load, fall back to system-ui with the same sizes — do not invent a fourth family.

**Source**: Brand book v1.0 §06. In-book app mocks that still show kit-type chips or a wordmark collection header are **not** type or layout rules.

Flag missing context; do not invent values, tokens, variants, or rules.

### Logo

Status: `locked` (Gap 2026-08-23: placement). Construction is brand book v1.0 §01–04; do not invent a second mark.

**Purpose**: Recognise KitCollective on entry, share, and system chrome. Collection scanning stays jersey-first — the product name in the Samling header is the screen title, not the brand lockup.

**Roles**:
| Role | Construction | Use |
| --- | --- | --- |
| Wordmark | Archivo “Kit” 400 + “Collective” 600, tracking −4.8% | Login, onboarding, splash when a horizontal lockup fits |
| Compact wordmark | Same construction, tighter for chrome | Share sheets / OG when a wordmark is needed beside the photo |
| KC mark | Square Archivo 700 “KC”, tracking −6% | Splash (centered), favicon, App Store / Play icon, OG when a square mark fits |

**Usage**: Allowed on **splash**, **login**, **onboarding**, **share / Open Graph**, **favicon**, and **store icons**. Collection home header is **Samling + count + notification** — no wordmark, no KC mark. Tab bar has no logo. Jersey tiles have no logo. Primary CTA fill stays black, never a logo color. Brand-book in-book mocks with a wordmark collection header are **not** a placement rule.

**Relationships**: Type families from Typography. Identity wash may sit as a thin OG top strip with the mark/wordmark; wash never behind the jersey photo. Catalog **Mark** (crest/monogram) is stamdata, not this logo.

**Constraints**: Contrast AA for wordmark on canvas. Do not recolor the mark to `#1F5EFF` or to wash. Do not place the logo on a jersey photo. Do not invent a mascot. `admin` app header stays product **name** text this gap (English), not a new lockup — flag if operators need the KC mark there.

**Example** *(not a rule)*: Login shows the wordmark above email/password. OG 1200×630: jersey dominates; compact wordmark or KC mark in the wash strip. Collection home: “Samling” `display` 28, no logo.

**Exceptions**: System share chrome uses OS type around our preview. Store icon may be the KC mark alone. Profil header KC mark is **deferred** — flag; do not invent.

**Source**: Brand book v1.0 §01–04. Placement: this gap (A+B). 3a artifact for “no logo on Samling header”.

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

Status: `locked` for the inventory below. A primitive not listed: **flag**. Do not invent components or variants.

**Inventory (v1)**: Button, Button dock, Icon button, Search field, Text field, Select field, Chip, Jersey tile, Mark, List row, Photo slot, Empty state, Sheet, Tab bar, Banner.

**Inventory (admin gap)**: Data table, Top tabs. Plus existing Button, Icon button, Search field, Text field, Chip, Mark, Empty state (`table`), Sheet, Banner.

**Deferred primitives**: Switch, checkbox, user avatar, paywall card, wishlist row. Do not invent a Filter primitive (use Button + Chip in Sheet). Do not invent an admin checkbox column.

A primitive not listed: **flag**. Do not invent components or variants.

### Button

**Purpose**: Commit an action the user asked for.

**Anatomy**: Label (required). Leading icon (optional). No subtitle inside the button.

**Properties**: `variant`: `primary` | `secondary` | `tertiary` | `destructive`. `width`: `hug` (default) | `fill`. `size`: `md` (default) | `sm`. `disabled`, `loading`.

**Variants**: `primary` = the one action that moves the task forward (`fill.primary`, `content.inverse`, `radius.sm`). `secondary` = alternative on the same surface (`fill.secondary` or outline `border.subtle` on `surface`). `tertiary` = low-emphasis, often inline (no fill). `destructive` = data-loss (`danger` fill, `content.inverse`). One `primary` per visible region. Dock primaries use `width.fill` with min hit target ≥ 48×48 on `mobile`. Inline and banner actions stay `width.hug`.

**States**: Rest, pressed, focus, disabled, loading (label stays; ignore a second submit).

**Accessibility**: Visible label. Focus = `border.focus`. Disabled is not the only explanation — pair with helper text when Save is blocked. Hit target ≥ 44×44 on `mobile` and for admin toolbar primary/destructive. Contrast AA.

**Composition**: Footer actions (via **Button dock**), empty-state action, inline in confirm. Destructive confirms in a Sheet when the cost is high. Camera chrome and banner inline actions stay `width.hug` — not docked, not side-by-side primaries on phone. Admin toolbar: `secondary` “Filters”; drill footer: `destructive` Take-down (never equal to a `primary` on the same row).

**Unsupported**: Two primaries in one region. Primary + destructive as equal side-by-side choices. `identity.wash` as button fill. Teal or cyan CTA. “+ New” as the admin toolbar primary.

**Example** *(not a rule)*: Confirm footer dock: `primary` “Gem” (`width.fill`), `tertiary` “Annuller” stacked below when present. Admin drill: `destructive` “Take down” opens Sheet `confirm`.

**Code**: `apps/mobile` — `Button`, `ButtonDock` in `src/components/ui.tsx`.

Flag missing context; do not invent values, tokens, variants, or rules.

### Button dock

**Purpose**: Pin footer actions to the bottom of the screen with safe-area padding.

**Anatomy**: Top border (`border.subtle`). Vertical stack (`space.gap.md`). One `primary` `width.fill` at top of stack. Tertiary paths below. Optional helper text above the primary when Save is blocked.

**Properties**: None beyond children.

**Variants**: None.

**States**: None.

**Accessibility**: Safe-area insets on `mobile`. Helper text explains blocks — disabled primary is not the only signal.

**Composition**: Login, register, confirm, empty collection. Not camera chrome or inline banner actions.

**Unsupported**: Side-by-side primaries on phone. Hugging centered pill as the only primary on these screens.

**Example** *(not a rule)*: Login dock: fill “Log ind” + tertiary “Opret konto” below.

**Code**: `apps/mobile` — `ButtonDock` in `src/components/ui.tsx`.

### Icon button

**Purpose**: Compact action when a visible text label would not fit.

**Anatomy**: Single icon. No caption inside the control.

**Properties**: `name` (accessible string, required). `icon`. `disabled`.

**Variants**: None. Emphasis comes from context, not a color variant. Do not add `primary` Icon button.

**States**: Rest, pressed, focus, disabled.

**Accessibility**: Accessible name required (e.g. “Luk”, “Kamera”, admin “Back”). Hit target ≥ 44×44 on `mobile`. On `admin`, icon actions may be **32×32** if the accessible name is present (visible tooltip or `aria-label`). Icon is not the only meaning — name is.

**Composition**: Header trailing actions (collection home: notifications), camera shutter chrome, admin header back. Not a substitute for Tab bar Add. Not a substitute for Top tabs.

**Unsupported**: Icon-only control without a name. Emoji as the icon. 32×32 icon actions on `mobile`.

**Example** *(not a rule)*: Capture header “Luk” to abandon a draft (confirm in Sheet if photos exist).

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Search field

**Purpose**: Filter a collection, find a catalog club, or filter an admin table by typed query.

**Anatomy**: Leading search icon (decorative). Field. Optional clear control (Icon button). Visible label or `accessibilityLabel` (required).

**Properties**: `value`, `placeholder` (not a label substitute), `onSubmit` / live filter. Collection search may filter as you type. Club search queries catalog IDs, never free-text club as truth. Admin search matches CatalogLabel aliases in every locale; displayed labels stay `en` on this surface.

**Variants**: `collection` (Søg place — filter owned jerseys). `catalog` (club pick on confirm). `admin` (toolbar). Same chrome; different data. Do not add a header-search variant on collection home.

**States**: Rest, focus, disabled, empty. Error is rare; if the query cannot run, use Banner, not a red search field.

**Accessibility**: Label associated. Hit target ≥ 44 tall. Keyboard: search / default.

**Composition**: Søg place, inside a Sheet for club pick, or admin toolbar with Filters. **Not** the collection home header. Uses `radius.pill`, `border.subtle`, `type.body`.

**Unsupported**: Land → league → club hierarchy instead of search. Free-text club saved as catalog truth. Wash fill inside the field.

**Example** *(not a rule)*: Confirm Sheet labelled “Klub”, placeholder “Søg klub”. Admin toolbar placeholder “Search clubs, kits, or collectors”.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Text field

**Purpose**: Collect a short string we actually store (notes under “Flere detaljer”; email and password on Admin SPA login). Not for club, season, type, size, or condition.

**Anatomy**: Visible label (required). Field. Hint (optional). Error (optional; replaces hint when invalid).

**Properties**: `value`, `placeholder` (not a label substitute), `optional`, `error`, `disabled`, platform keyboard hint. `type`: text | email | password as the platform allows.

**Variants**: Single-line default. Multiline only for notes.

**States**: Rest, focus, disabled, error. Empty is a value, not a special chrome.

**Accessibility**: Label associated. Error = `border.danger` **plus** text, announced when it appears. Admin login labels in English.

**Composition**: Stacks in the Sheet “Flere detaljer” with `space.gap.md`. Optional custom name on Ny genvej (same Sheet). Admin login card: email then password, then `primary` Sign in. Does not sit inside a Button. Not for catalog identity (club/season) — that is Search field or Select field.

**Unsupported**: Placeholder-only labels. Using Text field for catalog identity (club/season). Validating empty fields on every keystroke before blur/Save.

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

**Composition**: Horizontal row with `space.gap.sm` (collection: scroll horizontally if needed). Confirm Chip groups. Admin Filters Sheet. Collection home: `shortcut` chips **under** the header, then Tilpas. Hide the **entire** chip row (Alle, genveje, Tilpas) when the collection is empty. Owner `mobile` collection only — not public Astro.

**Unsupported**: Chip as a primary CTA. Kit-type chips (Hjemme/Ude/Tredje) on Samling. Encoding type with wash variant 2/3. Emoji. Plus control to add a genvej (plus is capture). Auto-selecting a chip after Gem (Alle stays selected).

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

**Composition**: Collection grid and Astro collection. Not used as the capture preview.

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

### List row

**Purpose**: Show one catalog or settings item and let the user select or navigate.

**Anatomy**: Leading Mark (optional) or drag-handle on `manage`. Title (`type.body` or `type.label`). Meta one line (`type.caption` or `type.mono` count on `manage`). Trailing chevron or selected check on `select` / `navigate`. `manage` trailing = edit + delete Icon buttons.

**Properties**: `title`, `meta`, `onPress` or `selected`.

**Variants**: `select` (club search / facet picker). `navigate` (settings later — if used before settings ship, flag). `manage` (Genveje Sheet list: drag-handle, name, count, edit, delete).

**States**: Rest, pressed, selected, disabled, focus. List loading is list-level, not a row variant.

**Accessibility**: Name = title + essential meta. Chevron decorative when the row is the control. Height ≥ 44 on `mobile`. `manage`: drag-handle named “Flyt”; edit and delete are Icon buttons with names; count is `type.mono` and included in the name.

**Composition**: Lives in a list inside a Sheet, a full-screen facet picker, or a screen. Empty list uses Empty state. `manage` only in the Genveje Sheet.

**Unsupported**: Multiple primary actions in one row **except** `manage` (edit + delete are explicit). Row as a form. Price as meta. Using `manage` on confirm club search.

**Example** *(not a rule)*: Club search result: Mark + “F.C. København” + meta “Superliga”.

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

**Purpose**: Explain an empty collection or an empty admin table and the next useful action.

**Anatomy**: Title (`type.title`). One-sentence body (`type.body`). Optional thin `identity.wash` rule above the title (garnish). Optional Button.

**Properties**: `title`, `body`, `action` (optional). `variant`.

**Variants**: `collection` (one `primary` action starts add/capture). `table` (admin; no create control — optional `tertiary` “Clear filters” only).

**States**: Rest. Do not animate emptiness.

**Accessibility**: Text is meaning; wash is decorative. Action uses Button when present. Admin copy in English.

**Composition**: `collection` replaces the grid **and** hides the genveje chip row. `table` replaces the Data table body when there are zero rows.

**Unsupported**: Sarcasm. Three actions. Empty state used for Save errors (that is Banner). Full-bleed wash background. Illustration libraries or emoji. `table` variant with a `primary` “+ New” / Add kit.

**Example** *(not a rule)*: “Ingen trøjer endnu” + “Tilføj den første fra galleriet.” + `primary` “Tilføj trøje”. Admin: “No kits match” + `tertiary` “Clear filters”.

**Code**: Unmapped. Flag.

Flag missing context; do not invent values, tokens, variants, or rules.

### Sheet

**Purpose**: Focused overlay task over the current screen (club search, more details, Genveje, admin Filters, destructive confirm).

**Anatomy**: Scrim. Raised surface (`radius.lg` on the sheet). Grab/handle optional (mobile). Title. Body. Optional footer Buttons.

**Properties**: `title`, `children`, `onDismiss`.

**Variants**: `form` (club search / more details / admin Filters / **Genveje**). `confirm` (destructive Take-down or demote).

**States**: Presenting, rest, dismissed. Focus trapped while open.

**Accessibility**: Title is the accessible name. Scrim dim + focus trap. Escape dismisses when the task is cancellable. Swipe-down may dismiss on `mobile` only. `motion.base`; reduced-motion = instant present, no travel. Admin titles in English.

**Composition**: `elevation.overlay`. Contains Search field, List row, Text field, Select field, or Chip groups. Does not contain Tab bar or Top tabs. Admin Filters: Chip `filter` groups (country, league, season, kit type, has photo). Admin confirm: title, consequence sentence, `destructive` + `tertiary` Cancel. Genveje: list and Ny genvej **share one Sheet** (body swaps; titles “Genveje” / “Ny genvej”). Facet pick is a **full-screen overlay** on top of that Sheet (Search field + List row), not a second Sheet.

**Unsupported**: Full-screen **place** for Genveje (it is a Sheet over Samling, not a sixth tab). Nested **Sheets** more than one deep — flag. Wash as scrim. Using Sheet as the admin drill (drill is a full page). Plus in the tab bar opening this Sheet.

**Example** *(not a rule)*: “Vælg klub” with Search field + List rows. Genveje Sheet: manage rows + `primary` “Tilføj”. Admin: “Take down this jersey?” with `destructive` “Take down”.

**Code**: Unmapped. Flag. Platform sheet OK if tokens (radius, colors) still apply.

Flag missing context; do not invent values, tokens, variants, or rules.

### Tab bar

Status: `locked` (Gap 2026-08-23: 3a five-slot icon-only pill).

**Purpose**: Switch the app’s five primary collector places. Center plus is capture, not a listing compose and not “new shortcut”.

**Anatomy**: Floating glass pill above the safe-area inset (Layout). Five slots, left → right:

| Slot | Icon metaphor | Accessible name (da) | Action |
| --- | --- | --- | --- |
| 1 | House | Samling | Own collection (app home after login) |
| 2 | Compass | Søg | Search place. Compass is the Søg **icon**, not a rename to “Discovery” |
| 3 | Raised plus (larger than the others, still **inside** the pill) | Tilføj trøje | Starts Photo slot capture. No destination screen named Add |
| 4 | Heart | Ønske | Wishlist **place**. Content of that place is deferred — empty state is allowed; do not invent a wishlist-row primitive |
| 5 | Person | Profil | Profile place |

Visible chrome is **icon-only**. No tab labels under the icons. No logo in the pill. Notification badge lives on the header bell, not on a tab.

**Properties**: `active`: `collection` | `search` | `wishlist` | `profile`. Plus is not an `active` place — pressing it starts capture and does not leave a selected plus state after dismiss. `onSelectPlace`, `onCapture`.

**Variants**: None. Unselected = `content.muted`. Selected place = `content.primary`. Plus uses primary ink; it is not a wash or sell bubble. No fill behind icons except the glass pill.

**States**: Active place, inactive, focus, pressed. Capture presenting is not a sixth tab state.

**Accessibility**: Role tab/tablist for the four places; plus is a button named “Tilføj trøje”. Names required even though chrome is icon-only. Hit target ≥ 44 per slot plus inset. Color is not the only selected signal (icon weight / fill vs outline — flag the host glyph set; do not invent a new icon family).

**Composition**: Screen footer region on `mobile` collector chrome. Public Astro and `admin` do not use this component. Selecting plus starts the capture flow; it does not open Genveje.

**Unsupported**: Visible labels (brand-book in-book tabs). Two-item Samling/Tilføj dock. FAB or plus **outside** the pill. Sixth control. “Discovery” as the product name for slot 2. Plus as “ny genvej”. Marketplace sell icon. Logo. Use on `admin` (Top tabs). Badge counts on tabs unless a later lock.

**Example** *(not a rule)*: On Samling, house is primary ink; compass/heart/person muted; plus raised in the middle; grid photos show through the glass.

**Code**: Unmapped. Flag. Throwaway Expo prototype is not the contract.

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

**Anatomy**: Column headers (`type.caption`). Rows **48px** tall. **32×32** square thumb (`radius.sm`) on Kit and UserJersey rows; empty 32px slot when no photo. Club, season, and user identity rows use Mark/monogram instead of a KitPhoto thumb. Primary cell `type.body`. Meta cells `type.caption`. Row divider `border.subtle`. No checkbox column.

**Properties**: `columns` (header + cell). `rows`. `onRowActivate` (required: opens drill). `selectedRowId` optional. Thumb URI required for Kit and UserJersey rows (empty slot if missing bytes).

**Variants**: `stamdata` and `collectors` share anatomy; columns differ. Do not add a third visual variant.

**States**: Rest, hover (`fill.secondary`), selected (`fill.secondary`), focus (row + `border.focus` on the table or active row), empty (body replaced by Empty state `table`), loading (keep header; do not invent a skeleton wash).

**Accessibility**: Role table (or grid if the host requires it for keyboard). Row is the control; Enter/Space activates drill. Tab moves to the table; arrow keys move between rows. Color is not the only selected signal (hover/selected fill plus focus ring). Thumbs have empty alt when decorative next to a text name; if the thumb is the only photo cue, name the row including “photo” / “no photo”.

**Composition**: Admin shell body. Does not wrap Jersey tiles. Filters live in the toolbar Sheet, not as extra header widgets besides sort — flag a sort affordance if a column needs it rather than inventing a new primitive.

**Unsupported**: Zebra stripes. Bulk checkboxes. 4:5 tiles. “+ New” in the table header. Archive JPEG as a club Mark. Stretching the thumb to 4:5. Players as a primary table in this gap.

**Example** *(not a rule)*: Stamdata kits: thumb, club (`en` CatalogLabel), season, type, photo count. Click opens kit drill.

**Code**: Unmapped until `apps/admin` exists. Flag; do not invent a host API.

Flag missing context; do not invent values, tokens, variants, or rules.

### Top tabs

**Purpose**: Switch the two Admin SPA places: Stamdata and Collectors.

**Anatomy**: Horizontal text tabs. Active: `content.primary` plus a **2px** `fill.primary` underline. Inactive: `content.secondary`. No pill fill. No icons required.

**Properties**: `items`: exactly `stamdata` | `collectors` in this gap. `active`. `onChange`.

**Variants**: None. Two items. Equal does not mean a third “Activity” tab — flag.

**States**: Active, inactive, focus, hover. Underline moves with `motion.fast`; reduced-motion = instant, no travel.

**Accessibility**: Role tab/tablist. Names in English (“Stamdata”, “Collectors”). Keyboard: Left/Right between tabs. Hit target ≥ 44 tall.

**Composition**: Below the admin app header, above the toolbar. Does not replace mobile Tab bar. Does not contain a “+ New” control.

**Unsupported**: Pill tabs. Four “metric table” pills. Icons-only tabs. Using Tab bar on `admin`. A third tab in this gap.

**Example** *(not a rule)*: Stamdata active with black underline; Collectors gray label.

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

### Confirm and Save

**Purpose**: Attach photos to catalog identity and save without a wizard.

**Composition**: Photo slot strip (at least one filled) + club Search (Sheet + List row + Mark) + club-scoped season + Chip groups (type, size, condition) + optional “Flere detaljer” Sheet (Text field, extra chips) + footer one `primary` Save. Vision suggestions appear as pre-selected chips or list selection when ready; Save does not wait.

**Unsupported**: Multi-step stepper. Prefilling club on “Ny trøje”. Free-text club. Blocking on manufacturer or kit completeness.

Flag missing context; do not invent patterns.

### Capture session

**Purpose**: Fill Photo slots.

**Composition**: First session: system gallery / picker, multi-select into roles. Repeat: one `CameraView`, three Photo slots overlaid, gallery as text/tertiary escape. Persist draft locally after each shot. Then Confirm and Save.

**Unsupported**: System camera one-shot as the repeat primary path. Asking camera + photos + push on first launch.

Flag missing context; do not invent patterns.

### Admin shell

**Purpose**: Operator chrome for scanning stamdata or collectors.

**Composition**: App header (name, no “+ New”) + Top tabs (Stamdata | Collectors) + toolbar (Search field `admin` + Button `secondary` “Filters” + `caption` count) + Data table (or Empty state `table`). Filters Sheet `form` contains Chip `filter` groups: country, league, season, kit type, has photo. Login is a separate centered 400px card (Text field email/password + Button `primary` “Sign in”) — not this shell.

**Unsupported**: “+ New”. Bulk checkboxes. Bottom Tab bar. Split-view detail. Zebra. Danish chrome. Dark canvas. Peek HTML as a pane inside the shell.

Flag missing context; do not invent patterns.

### Admin drill

**Purpose**: Show one row’s evidence and the allowed mutations.

**Composition**: Icon button “Back” + `title` + evidence (KitPhoto or UserJersey photos, not 4:5 collection grid as the page layout) + meta (`type.body` / `type.caption`). User drill: promote/demote as Button `secondary` (disabled with helper text for self or last admin). UserJersey drill: Take-down as Button `destructive`. Both destructive paths open Sheet `confirm` before the mutation. Squad on a club–season drill is count + expand, not a Players table.

**Unsupported**: Editing CatalogLabel or Kit identity. Setting `rights: public`. Bulk take-down. Demoting self or the last admin. Showing KitPhoto on a collector-facing surface from this page.

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
| Tab bar | mobile | *unmapped* | Five icon-only slots in a glass pill; plus → capture |
| Catalog peek | api | `GET /v1/catalog/peek` | Not in this system |
| OG canvas | web | *unmapped* | 1200×630; letterbox 4:5; wash top strip only |
| KitPhoto render | admin | *unmapped* | 32px table thumb + drill; never Expo/Astro/OG |

**Behavior parity**: Save, gallery-first vs camera-repeat, and “no archive renders” on collector surfaces are product rules (`CONTEXT.md` + this file), not platform exceptions. Admin may render KitPhoto. Staff access, Take-down, and English chrome are product rules, not visual exceptions.

**Collection chrome source**: The 3a artifact (`.scratch/collection-main-screen/claude-design/KitCollective-samling-og-genveje-3a.html`) is the visual reference for Samling chrome **except** Genveje is a **Sheet**, not a full-screen place. Brand book v1.0 is type + logo construction only. `apps/mobile/src/prototype/` is throwaway evidence of feel — not a host contract and not copy-paste UI.

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
| Expo Web as first-class | Degraded by stack lock | If Expo Web ships as a real surface |
| Ønske place **content** | Tab exists; list/row UI not locked | Wishlist feature slice |
