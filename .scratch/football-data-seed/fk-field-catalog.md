# Field catalog — Football Kit Archive (focused)

**Issue:** [KIT-140](https://linear.app/kitcollective/issue/KIT-140/football-kit-archive-research-sponsor-colours-types)  
**Parent catalog:** [field-catalog.md](./field-catalog.md) (KIT-138)  
**Accept:** Nicklas signs off this slice before any FK kit **fetch** grain is implemented.  
**Breadth:** Superliga **2010/11** club kits (FCK TM id `190`) and Denmark men **World Cup 2010** national kits — same proof seasons as Hierarchy.  
**Classifications:** `stamdata now` | `later leverage` | `drop` | `transport gap`  
**Hard drops (ADR-0002):** market value, agent PII, FKA branding (brand/club logos, bare FKA page URLs as product assets).  
**Transport lock:** **No Seed proxy / Decodo** on FKA or FKApi. Live FK uses `FKAPI_BASE_URL` (+ token) or fixtures.

Seed-module interface: [`seed/fkapi/reference.md`](../../seed/fkapi/reference.md)

---

## Evidence (this pass)

| Source | What |
| --- | --- |
| FKApi docs | [Data models](https://mintlify.wiki/sunr4y/fkapi/concepts/data-models), [Kits API](https://mintlify.wiki/sunr4y/fkapi/api/endpoints/kits.md) — `Type_K` categories, `Color` name+hex, **no sponsor field** |
| FKApi source | [sunr4y/fkapi `Kit` model](https://github.com/sunr4y/fkapi/blob/master/fkapi/core/models.py) — `kit_id`, `team` (Club), `season`, `type`, `brand`, `primary_color`, `secondary_color` M2M, `design`, `rating`, logos via Brand/Club. **No `sponsor` column** |
| Indexed FKA HTML (no Decodo) | [FC Copenhagen 2010-11 Home](https://www.footballkitarchive.com/fc-copenhagen-2010-11-home-kit/) — Sponsor **Carlsberg**; Colors `White / Black / Blue`; Type `Home`; Brand `Kappa`; Season `10-11` |
| Indexed FKA HTML | [FCK 2010-11 Away](https://footballkitarchive.com/fc-copenhagen-2010-11-away-kit/31573/) — Sponsor **Carlsberg**; Colors `Black / Blue`; Type `Away` |
| Indexed FKA HTML | [FCK 2010-11 kit index](https://footballkitarchive.com/fc-copenhagen-2010-11-kits/) — Home, Away, Third, Special, CL Home (+ V2), European Away, GK 1–3, CL GK variants, Track |
| Indexed FKA HTML | [Denmark 2010 kit index](https://footballkitarchive.com/denmark-2010-kits/) — match: Home, Away, GK Home, GK Away; plus Training / Anthem / Track / Rain |
| Indexed FKA HTML | Denmark 2010 [Home](https://footballkitarchive.com/denmark-2010-home-kit/9857/) / [Away](https://footballkitarchive.com/denmark-2010-away-kit/9858/) / [GK Home](https://www.footballkitarchive.com/denmark-2010-gk-home-kit/60206/) / [GK Away](https://footballkitarchive.com/denmark-2010-gk-away-kit/60205/) — Team `Denmark`; Season `2010`; Brand `adidas`; **no Sponsor row** on match kits |
| Indexed FKA HTML | [Denmark 2010 Training](https://footballkitarchive.com/denmark-2010-training-kit/265170/) — Type `Training`; Sponsor **Arla** (dropped type; sponsor on training does not change match-kit stamdata) |
| Direct FKA GET | Cloudflare challenge (same class as KIT-138 403). Do **not** unlock with Decodo. Indexed public pages + FKApi docs/source are the evidence. |
| Repo | `kit.sponsor_name` exists; `kit.national_team_id` exists; `FkRawKit` has no colour or sponsor fields yet; mapper resolves TM **club** ExternalId only |
| schema-gap | `kit.primary_color_hex`, `kit.secondary_color_hex` — **new columns** when grain lands |

---

## FK after facts (lock)

| Rule | Detail |
| --- | --- |
| **When** | Live FK fetch runs only after Transfermarkt has written **Club or NationalTeam + Season** for the same scope |
| **Refuse** | Missing side or season → no kit rows, no R2 writes |
| **Club path** | TM `external_id` (`system=transfermarkt`, `entity_type=club`) + season label → `kit.club_id` |
| **NT path** | FKA team `id` / `id_fka` → `external_id` (`system=fkapi`, `entity_type=national_team`) + season label → `kit.national_team_id` — **never** `club_id` |
| **Fixture path** | Hermetic fixtures may pre-seed TM ExternalIds; same refuse rules apply to live adapter |
| **Proxy** | Never inject Seed proxy / Decodo into FK fetch |

This lock is unchanged from KIT-138. No kit grain ticket may ship without enforcing it in the fetch adapter and mapper. Today's mapper already refuses missing TM club + season on the **club** path; the NT path is catalog-accepted, not implemented.

---

## Club kit vs NationalTeam kit

FKA and FKApi use one **team** entity (`Club` in FKApi) for both domestic clubs and national sides. Our schema keeps them as **siblings** — Club kits land on `kit.club_id`; NationalTeam kits land on `kit.national_team_id`.

### Proof-season join map

| Side | TM ExternalId | Our row | FKA team (observed) | FKA slug (observed) | Season label |
| --- | --- | --- | --- | --- | --- |
| FC Copenhagen | `190` (club) | `club` | FC Copenhagen | `fc-copenhagen-kits` | `10-11` / `2010-11` |
| Denmark men | `3436` (NT) | `national_team` | Denmark | `denmark-kits` | `2010` (calendar — WC year) |

FKA kit URL ids (kit grain ExternalId candidates, **not** team ids): Denmark Home `9857`, Away `9858`, GK Home `60206`, GK Away `60205`; FCK Away `31573`.

### Join keys

| Grain | Primary join | Secondary / fallback |
| --- | --- | --- |
| **Club kit** | TM club id → our `external_id` (`transfermarkt`, `club`) — **existing** | FKA `team.id_fka` → optional `external_id` (`fkapi`, `club`) when TM id absent |
| **NationalTeam kit** | FKA team `id` / `id_fka` → our `external_id` (`fkapi`, `national_team`) — **new on NT grain** | CatalogLabel alias on `national_team` matching FKA team name (`Denmark`) |

**Why not TM id for NT kits:** Transfermarkt `verein/3436` is a NationalTeam identity, not a club. FKApi `/api/kits?club=` expects FKApi club ids — Denmark's FKA team id differs from TM `3436`. The NT kit grain resolves **FKA team → our national_team UUID**, then season label.

**Open (does not block catalog accept):** exact FKApi `Club.id` / `id_fka` for Denmark and FCK — confirm on first live FKApi call without Decodo (`/api/clubs/search?keyword=`).

### Sibling enforcement

| Check | Rule |
| --- | --- |
| Denmark WC 2010 kit | `kit.national_team_id` set, `kit.club_id` null |
| FCK Superliga 2010/11 kit | `kit.club_id` set, `kit.national_team_id` null |
| Mapper today | Club-only — NT path is catalog-accepted, not implemented |

---

## Kit type vocabulary

### Our domain enum (`@kit/domain`)

`home` | `away` | `third` | `gk` | `special`

### FKApi `Type_K` (source)

FKApi exposes richer types with **category** (`match`, `prematch`, `preseason`, `training`, `travel`, `jacket`) and `is_goalkeeper`.

### Normalization (proof scope)

| FKA / FKApi type name (observed) | FKApi category | Our `kit.type` | Classification |
| --- | --- | --- | --- |
| Home | match | `home` | **stamdata now** |
| Away | match | `away` | **stamdata now** |
| Third | match | `third` | **stamdata now** |
| Special | match | `special` | **stamdata now** (FCK 2010-11 lists one) |
| GK Home, GK Away, GK 1, GK 2, GK 3 | match | `gk` | **stamdata now** |
| Champions League Home (+ V2), European Away, CL GK variants | match | same base type (`home` / `away` / `gk`) | **later leverage** — competition-specific duplicate; keep first match kit per base type for proof unless Join workflow names CL variants |
| Training, Anthem, Track, Rain, Bench, Warm-up, Pre-season | training / jacket / … | — | **drop** for Football Data Seed proof |
| Design (Plain, Stripes, Graphic, Hoops, Chest band, …) | — | — | **later leverage** — optional CatalogLabel; not a column on proof |

**Proof accept:** one row per `(side, season, base type)` for `home`, `away`, `third`, `gk`, `special` where FKA lists a match-category kit. Drop training/anthem/track rows for Superliga 2010/11 and Denmark 2010 proof.

**Proof-season type lists (indexed FKA):**

- FCK 2010-11: Home, Away, Third, Special, Champions League Home, Champions League Home V2, European Away, GK 1–3, Champions League GK 1 (+ V2), Track.
- Denmark 2010: Home, Away, GK Home, GK Away (match); Training ×3, Anthem, Track, Rain (dropped).

---

## Colours

| Field | Source shape | Classification | Postgres |
| --- | --- | --- | --- |
| Primary colour name | FKApi `primary_color.name`; FKA fact table slash-list (first colour) | **stamdata now** | optional `catalog_label` on `kit` |
| Primary colour hex | FKApi `primary_color.color` | **stamdata now** | **`kit.primary_color_hex`** (new column) |
| Secondary colour name(s) | FKApi `secondary_color[]`; FKA slash-list (remaining) | **stamdata now** | optional `catalog_label` |
| Secondary colour hex | FKApi first secondary `color` | **stamdata now** | **`kit.secondary_color_hex`** (new column) |
| Tertiary+ colours | FKApi multiple secondaries (FCK Home lists three names: White / Black / Blue) | **later leverage** | extend only if product contests need full palette |

**Column decision:** colours **need new columns** — `primary_color_hex` and `secondary_color_hex` on `kit` (see [schema-gap.md](./schema-gap.md)). Names may live in CatalogLabel when hex alone is not enough for display. **`kit.sponsor_name` already exists** and is a different fact.

**Observed proof colours (FKA name slash-list; hex from FKApi on the grain ticket):**

| Kit | Colors |
| --- | --- |
| FCK 2010-11 Home | White / Black / Blue |
| FCK 2010-11 Away | Black / Blue |
| Denmark 2010 Home | Red / White |
| Denmark 2010 Away | White / Red |
| Denmark 2010 GK Home | Black / Yellow / Red |
| Denmark 2010 GK Away | Green / White |

**Normalize seam:** extend `FkRawKit` with `primaryColorName?`, `primaryColorHex?`, `secondaryColorName?`, `secondaryColorHex?` on the FK grain ticket — not on this research ticket.

**Not Kit colours:** Transfermarkt club colour swatches on Club facts (`club.primary_color_hex`) — different entity.

---

## Sponsor

| Field | Source | Classification | Postgres |
| --- | --- | --- | --- |
| Sponsor name | FKA HTML fact table (`Sponsor \| Carlsberg` on FCK 2010-11 Home and Away) | **stamdata now** (source confirmed for **club** match kits) | **`kit.sponsor_name`** — **already exists** |
| Sponsor on NT match kits | Not on Denmark 2010 Home / Away / GK fact tables | **stamdata now** when present; null when absent | same column, nullable |
| Sponsor on dropped types | Denmark 2010 Training lists Sponsor **Arla** | **drop** with the training row | do not invent a match-kit sponsor from a training shirt |
| Sponsor via FKApi REST | **Not** in `Kit` model or `/api/kits/{id}` response | **transport gap** | column ready; FKApi adapter cannot populate until upstream adds field |

**Research lock:**

1. **`kit.sponsor_name` already exists** — no new column.
2. Sponsor is **stamdata now** when the source exposes it (FKA HTML does for sponsored club match kits).
3. **FKApi transport gap:** current OSS FKApi does not scrape or return sponsor. The FK grain ticket must either (a) wait for FKApi upstream to add sponsor, or (b) add a non-Decodo FKA fact-table parse on a dedicated follow-up — not Decodo, not Nest.
4. Do **not** drop sponsor because FKApi lacks it — the fact exists on FKA for club kits.

---

## Summary by field (kit grain)

| Field | Stamdata now | Later leverage | Drop | Notes |
| --- | --- | --- | --- | --- |
| FK kit id | ✓ | | | ExternalId `fkapi` / `kit` |
| Type (normalized) | ✓ | | | see normalization table |
| Manufacturer / brand name | ✓ | | | Manufacturer + CatalogLabel |
| Season label | ✓ | | | join to our `season` |
| Archive image bytes | ✓ | | | KitPhoto admin_only |
| Primary / secondary colour name + hex | ✓ | tertiary+ | | **new hex columns** |
| Sponsor name | ✓ (when source has it) | | | column exists; **FKApi gap** |
| Club join (TM club id) | ✓ | | | existing mapper |
| NT join (FKA team id) | ✓ (once confirmed) | | | **new grain path** |
| English kit label | | ✓ | | CatalogLabel |
| Design pattern | | ✓ | | |
| Competition tags on kit | | ✓ | | CL duplicate kits |
| Rating | | | ✓ | noise |
| Brand / club logos, FKA URL | | | ✓ | ADR-0002 branding |
| Training / anthem / track kits | | | ✓ | proof scope |

---

## Stamdata now (FK proof accept)

FK kit id · normalized type (`home` / `away` / `third` / `gk` / `special`) · manufacturer · season join · TM-side club join **or** FKA-side national_team join · archive bytes · **Kit colours** (name + hex → new columns) · **Kit sponsor** (→ existing `sponsor_name` when source provides it).

## Later leverage

CL/European variant kits · design pattern · English label · competition tags · extra secondary colours beyond first pair.

## Drop

Rating · FKA/TM logos and bare URLs as product assets · prematch/training/travel/jacket category kits for proof scope (including a training-shirt sponsor such as Arla).

## Transport gap (not drop, not deferred stamdata)

FKApi REST lacks **sponsor** today — column and FKA HTML source are ready; adapter populate waits on FKApi upstream or non-Decodo FKA parse ticket.

---

## HITL accept

- [ ] Nicklas accepts this catalog as the given FK depth list before kit fetch grains start.
- [ ] Colours need **`kit.primary_color_hex`** and **`kit.secondary_color_hex`** — confirmed.
- [ ] **`kit.sponsor_name`** already exists — confirmed; FKApi gap documented.
- [ ] Club vs NationalTeam kits stay sibling grains — NT join via FKA team id, not TM club id.
- [ ] FK after facts lock unchanged — no kit fetch without side + season rows.
