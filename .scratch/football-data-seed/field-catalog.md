# Field catalog — Transfermarkt & Football Kit Archive

**Issue:** [KIT-138](https://linear.app/kitcollective/issue/KIT-138/vendor-research-for-transfermarkt-and-football-kit-archive)  
**Accept:** Nicklas signs off this catalog before any other Football Data Seed issue starts.  
**Breadth:** Hierarchy proof only — Superliga **2010/11** (`DK1`, `saison_id=2010`) and Denmark men **World Cup 2010** (TM national side `verein/3436`, calendar `saison_id=2010`). Not every league.  
**Classifications:** `stamdata now` | `later leverage` | `drop`  
**Hard drops (ADR-0002):** market value, agent PII, Transfermarkt / FKA branding (logos, profile URLs as product assets).  
**HITL (2026-08-30):** Human-only ingest — take Rich grain facts while on the page (Club facts, kader DOB/nat/height/foot/position, Kit colours, Player photo + place of birth / home-country name, jersey number history, **Honours** on Club / NationalTeam / Player) as **stamdata now**, not deferred “later”. Marketing and collector contests need that depth. **Seed proxy (Decodo) is Transfermarkt-only** — never route Football Kit Archive through it.

Seed-module interfaces live beside the trees:

- Transfermarkt grains → [`seed/apify/reference.md`](../../seed/apify/reference.md)
- Football Kit Archive grains → [`seed/fkapi/reference.md`](../../seed/fkapi/reference.md)
- Postgres landing plan → [`schema-gap.md`](./schema-gap.md) (**given** for grain migrations)

---

## Evidence (this pass)

| Source | What |
| --- | --- |
| Repo | `seed/apify` parsers/types/normalize; `seed/fkapi` types/normalize/fixture; `packages/db` kit/club/national_team schema; ADR-0002, ADR-0032; CONTEXT Rich grain |
| Live TM HTML 200 | Superliga 2010/11 competition; FCK kader `plus/1`; FCK club + facts; player profil / rückennummern / erfolge; Denmark kader ± `plus/1` (via Seed proxy / Decodo when Coolify-live) |
| Live FKA HTML | **403** this session without proxy — **do not** unlock with Decodo; use FKApi (`FKAPI_BASE_URL`) or a non-Decodo path |
| FKApi docs | Unofficial scraper API named by `FKAPI_BASE_URL` — [data models](https://mintlify.wiki/sunr4y/fkapi/concepts/data-models): type, brand, primary/secondary colour, image; **no sponsor field** |

---

## Proof-season page map

| Grain | Vendor page (observed) |
| --- | --- |
| League season | `…/superligaen/startseite/wettbewerb/DK1/saison_id/2010` |
| Club season | `…/kader/verein/{id}/saison_id/2010/plus/1` |
| Club | `…/startseite/verein/{id}`, `…/datenfakten/verein/{id}`, `…/erfolge/verein/{id}` |
| Player (hop) | `…/profil/spieler/{id}` (+ `/rueckennummern`, `/erfolge` on Player grain) |
| NationalTeam | `…/daenemark/startseite/verein/3436`, `…/erfolge/verein/3436` |
| NationalTeam season | `…/daenemark/kader/verein/3436/saison_id/2010` (+ `/plus/1`) |
| Kit | FKApi / FKA after Club or NationalTeam + Season exist — **no Decodo** |

**Live Superliga 2010/11 clubs (competition page):** 190 FCK, 206 Bröndby IF, 173 OB, 865 FCM, 2778 FCN, 1053 AaB, 5724 Randers, 3426 Esbjerg, 1177 Silkeborg, 369 Lyngby, 5817 SønderjyskE, 2414 Horsens.  
Hermetic fixtures still use Brøndby `191` — not the live 2010 id.

---

## Summary by Hierarchy grain

### League — Transfermarkt

| Field | Class | Note |
| --- | --- | --- |
| Competition code (`DK1`), slug, name | stamdata now | ExternalId + CatalogLabel |
| Country name → ISO | stamdata now | Map to our Country |
| League level, team count, UEFA coeff, champions trivia | later leverage | Not Hierarchy PK |
| Market-value aggregates | drop | ADR-0002 |
| TM crest / competition URLs | drop | Branding |

### League season — Transfermarkt

| Field | Class | Note |
| --- | --- | --- |
| `saison_id`, season label (`10/11` / `2010/11`) | stamdata now | Season ExternalId / walk key |
| `startsOn` / `endsOn` / `calendarKind` | stamdata now | **Our derivation** today — not published ISO dates on the page |
| Club list (`/verein/{id}` + name) | stamdata now | Source of Club season pairs |
| Per-club squad size / ø-age / foreigners | later leverage | Optional aggregates |
| Market-value columns | drop | ADR-0002 |
| Fixtures / standings / scorers | drop | Out of Football Data Seed stamdata |

### Club — Transfermarkt

| Field | Class | Note |
| --- | --- | --- |
| TM club id, display name, country | stamdata now | ExternalId + CatalogLabel |
| Official name, founded, stadium, capacity, club colour swatches, website | **stamdata now** | **Club facts** — take while on the club/facts page (Rich grain; marketing depth) |
| **Honours** (titles / achievements) | **stamdata now** | TM `/erfolge/verein/{id}` — season + title rows (e.g. Danish champion). Same pattern for Club and NationalTeam |
| Address / Tel / Fax | drop | Contact / PII-adjacent |
| Current squad stats, transfer record, table position (homepage = current season) | drop | Not 2010/11-frozen |
| TM crest / `tmLogoUrl` / profile URL | drop | ADR-0002 |
| Kit manufacturer on club page | open | Not observed on FCK facts this pass — kits are FK grain |

### Club season — Transfermarkt kader `plus/1`

**Observed headers (FCK 2010/11):** `#`, Player, Date of birth/Age, Nat., Current club, Height, Foot, Joined, Signed from, Market value.  
**Parser today:** jersey `#`, player id, player name only — **must grow** to Rich grain fields below.

| Field | Class | Note |
| --- | --- | --- |
| Club id + season id; player id; name; jersey `#` | stamdata now | TeamSeason + Player + PlayerClubSeason |
| Position, DOB, nationality, height, foot | **stamdata now** | On `plus/1` already — no second hop; enables contests (e.g. left-footed players) |
| Joined / Signed from / Current club | drop until proven | Sample rows polluted with present-day dates |
| Market value | drop | ADR-0002 |
| Loan / parent-club markers | open | Not on FCK 2010 sample; **Player registration** stays open |
| Player portrait on kader row | **stamdata now** | Same **Player photo** rule as profile — bytes + admin_only, not a hot-linked TM URL |
| TM crest / bare profile URL | drop | Branding |

### NationalTeam — Transfermarkt

| Field | Class | Note |
| --- | --- | --- |
| TM id (`3436`), name, country | stamdata now | Map to **`national_team`**, never `club` |
| Gender | stamdata now | Ours (men first proof) |
| Official association name, founded, confederation | **stamdata now** | Same Rich grain rule as Club facts |
| **Honours** (titles / achievements) | **stamdata now** | TM `/erfolge/verein/{id}` — e.g. World Cup, European Championship (same page family as Club) |
| FIFA ranking on live page | drop | Current framing, not WC-2010 frozen |
| Address / Tel / Fax; TM crest | drop | Same rules as Club |

### NationalTeam season — Transfermarkt

| Field | Class | Note |
| --- | --- | --- |
| `saison_id=2010`; squad player ids; jersey `#` when set | stamdata now | NT season grain |
| Parent club (call-up), DOB, height, foot, position | **stamdata now** | NT `plus/1` — same depth as club kader |
| Caps / goals / debut columns | later leverage | Confirm career-to-date vs season before treating as season facts |
| Market value | drop | ADR-0002 |
| WC-2010-only 23-man list | open | Calendar-2010 kader had ~57 players; FIWC participant HTML empty this session — **Tournament squad** still needs confirm |

### Player — Transfermarkt

| Field | Class | Note |
| --- | --- | --- |
| TM player id, display name | stamdata now | ExternalId + CatalogLabel |
| Date of birth | **stamdata now** | On kader `plus/1` and profile — identity + age contests |
| Nationality / citizenship (incl. dual when shown) | **stamdata now** | Kader flag / profile |
| Height, preferred foot, position | **stamdata now** | Kader `plus/1` |
| Place of birth | **stamdata now** | Profile info-table when present |
| Name in home country | **stamdata now** | Profile — CatalogLabel / alias |
| **Player photo** (portrait bytes) | **stamdata now** | Face image from kader/profile; store like KitPhoto — lane object store, `rights: unresolved`, `admin_only` until cleared. **Not** TM crest/logo branding. Fetch only via TM path (Decodo ok). Never hot-link TM CDN in Expo/Astro/OG |
| Youth clubs | later leverage | Profile section — nice depth, extra parse |
| **Honours** (`/erfolge/spieler/{id}`) | **stamdata now** | Titles/trophies — same **Honours** noun as Club/NationalTeam; Rich Player grain |
| **Jersey number history** (`/rueckennummern`) | **stamdata now** | Season + club/NT + `#` career table — take while on Player grain (Rich grain; cross-check kader `#`, contests) |
| Agent / agency; market value; contract; boot outfitter | drop | ADR-0002 / not kit |
| TM logo / profile URL as product asset | drop | Branding (distinct from Player photo bytes) |
| Current shirt number on profile | drop as historical | **Current** club `#`, not proof-season `#` |

### Player season — Transfermarkt

| Field | Class | Note |
| --- | --- | --- |
| Player + Club or NationalTeam + Season + jersey `#` | stamdata now | Club path → `player_club_season`; NT path needs sibling mapping |
| Position that season | **stamdata now** | From kader row |
| Appearances / goals; loan registration | open | Not on observed kader columns |
| Market value “as of season” | drop | Historical kader shows current MV |

### Kit — Football Kit Archive / FKApi

| Field | Class | Note |
| --- | --- | --- |
| FK kit id; type (`home\|away\|third\|gk\|special`); manufacturer/brand name; season label | stamdata now | Kit + Manufacturer + CatalogLabel |
| Club join via `clubTransfermarktId` | stamdata now | Adapter join after TM Club+Season |
| Archive image bytes → KitPhoto `admin_only` / `rights: unresolved` | stamdata now | Never Expo/Astro/OG |
| Primary / secondary colours (name + hex) | **stamdata now** | **Kit colours** — FKApi Color models; **new** `kit.primary_color_hex` / `kit.secondary_color_hex` — [fk-field-catalog.md](./fk-field-catalog.md) |
| English kit label | later leverage | Optional CatalogLabel |
| Sponsor | **stamdata now** when source has it | **`kit.sponsor_name` exists**; FKA HTML confirmed (FCK 2010-11 Carlsberg); FKApi REST **transport gap** — [fk-field-catalog.md](./fk-field-catalog.md) |
| Design, competition tags | later leverage | CL/European variant kits are later leverage on proof |
| Rating, brand/club logos, FKA page URL as product asset | drop | Branding / noise |
| Training / anthem / track kits | drop | Proof keeps match-category types only |
| NationalTeam kit join | **stamdata now** (path accepted) | FKA team id → `external_id` (`fkapi`, `national_team`) → `kit.national_team_id`; mapper still club-only until grain |
| Transport | lock | **No Seed proxy / Decodo** on FKA or FKApi requests |

---

## Stamdata now (proof accept)

TM competition id/slug/name/country · season id+label · club id+name+country + **Club facts** + **Honours** · club-season squad (player id, name, `#`, **position, DOB, nationality, height, foot**, portrait when on row) · NationalTeam id+name+gender+country + association depth + **Honours** · NT-season squad (`#`, call-up club, DOB, height, foot, position when present) · Player id+name + **DOB, nat, height, foot, position, place of birth, home-country name, Player photo, jersey number history, Honours** · FK kit id, type, manufacturer, season join, TM-side club join **or** FKA-side national_team join, archive bytes, **Kit colours**, **Kit sponsor** (when source has it).

## Later leverage

League chrome trivia · competition-table aggregates · youth clubs · NT caps/goals/debut until scoped · kit design/competition tags · English kit label · CL/European kit variants.

## Drop

All market value · agent/agency · TM and FKA **logos** & bare profile URLs as product assets (Player photo **bytes** are kept) · contact address/phone/fax · transfer fees/records · boot outfitter · Joined/Signed-from until proven season-true · current profile shirt number as historical season `#`.

## Open confirms (do not invent)

1. Exact FKApi `Club.id` / `id_fka` for FCK and Denmark — confirm on first live FKApi search without Decodo. FKA HTML sponsor/colours/types and NT join **path** are accepted in [fk-field-catalog.md](./fk-field-catalog.md) (KIT-140).
2. WC-2010-only **Tournament squad** vs calendar-2010 NT kader.
3. FIWC participant/squad HTML when not empty.
4. Whether historical Joined / Signed from / Current club can be trusted for 2010/11.
5. Loan / registration markers on other Superliga 2010/11 clubs.

Schema shape for **stamdata now** fields is not open — see [schema-gap.md](./schema-gap.md).

---

## HITL accept

- [ ] Nicklas accepts this catalog (and the Seed references) as the given field list for later Football Data Seed issues.
- [ ] Open confirms stay open — they do not block Hierarchy grain tickets from using **stamdata now**.
- [x] Rich depth (Club facts, kader body facts, Kit colours) is **stamdata now** (HITL 2026-08-30).
- [x] Seed proxy (Decodo) is **Transfermarkt-only** (HITL 2026-08-30).
- [x] Player DOB + **Player photo** (+ place of birth / home-country name) + **jersey number history** are **stamdata now** (HITL 2026-08-30).
- [x] **Honours** on Club, NationalTeam, and Player are **stamdata now** (HITL 2026-08-30).
