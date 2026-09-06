# Compose catalog — Join workflow

**Issue:** [KIT-145](https://linear.app/kitcollective/issue/KIT-145/join-workflow-research)  
**Accept:** Nicklas signs off this catalog before the Join workflow is coded ([KIT-146](https://linear.app/kitcollective/issue/KIT-146/join-workflow-for-superliga-201011-and-denmark-world-cup-2010)).  
**Breadth:** Superliga **2010/11** (`DK1`, `saison_id=2010`) and Denmark men **World Cup 2010** (TM national side `verein/3436`, calendar `saison_id=2010`). Not every league.  
**Upstream catalogs (given):** [field-catalog.md](./field-catalog.md) (KIT-138) · [fk-field-catalog.md](./fk-field-catalog.md) (KIT-140) · [schema-gap.md](./schema-gap.md)  
**Seed references:** [`seed/apify/reference.md`](../../seed/apify/reference.md) · [`seed/fkapi/reference.md`](../../seed/fkapi/reference.md)

This file names what a **complete named season** means in lane Postgres and R2 for the Club path and the NationalTeam path. It is the given for KIT-146 — not executable code.

**Not this milestone’s accept:** the one-sentence **Seed run** (ADR-0014). Grains stay the first public interface; the sentence is the Join workflow **operator protocol** once the walk is implemented — milestone 3 code accept, not milestone 1.

---

## Evidence (this pass)

| Source | What |
| --- | --- |
| Repo | `club_proof` / `national_team_proof` grains; `@kit/seed-apify` walk + `@kit/seed-fkapi` scopes; `GET /v1/catalog/peek`; ADR-0014, ADR-0032, ADR-0010 |
| KIT-143 / KIT-144 | Club Rich grain + FK club kits; NationalTeam Rich grain + FK NT kits landed on `development` |
| field-catalog.md | Superliga 2010/11 club list (12 sides); Denmark NT kader ± `plus/1`; FK proof kit ids |
| fk-field-catalog.md | Match-kit types kept; FK-after-facts join keys; sibling `kit.club_id` vs `kit.national_team_id` |

---

## Definition — complete named season

A named season is **complete in the lane** when **both** are true:

1. **Stamdata** — every Hierarchy grain row the path requires exists in Postgres for that scope, with Rich grain fields from the accepted catalogs, ExternalId upsert, forbidden fields absent, and Club ≠ NationalTeam sibling enforcement.
2. **Image bytes** — every Kit grain kept for proof has at least one `kit_photo` row pointing at an object in the lane bucket (`rights: unresolved`, `visibility: admin_only`). Player portraits from kader rows follow the same pattern on `player_photo` when the Club / NationalTeam season grain wrote them.

**Demo surface:** `GET /v1/catalog/peek` lists season label, each side name, squad count, and per-side kit types with photo counts — not public JPEG URLs (ADR-0016).

**Out of complete:** market value, agent PII, vendor branding, training/anthem/track kits (FK proof drop), CL/European duplicate kits (later leverage), tournament-squad-only cuts until a vendor page is confirmed.

---

## Club path — Superliga 2010/11

**Named season:** competition `DK1` / alias `superliga` / `superligaen`, season label **`2010/11`** (`saison_id=2010`).

### Internal grain composition (Join workflow)

Order is fixed; **Already seeded** may skip a club+season pair that already has a squad with jersey numbers (ADR-0010).

| Step | Grain / hop | Writes (Postgres) | Notes |
| --- | --- | --- | --- |
| 1 | **League** (once per competition) | `league`, `country`, `external_id`, labels | Skip if league ExternalId exists |
| 2 | **League season** | `season`, club list on competition page | Source of club ids for the season |
| 3 | **Club** × N | `club`, Club facts, **Honours**, labels, TM `external_id` | N = every club on the competition season page (live proof: **12** clubs — see field-catalog) |
| 4 | **Club season** × N | `team_season`, `player`, `player_club_season`, Rich kader body, optional **Player photo** | Each club in step 3 for `2010/11`; profile hop only when id / `#` / body facts missing |
| 5 | **FK after facts** | `kit`, `manufacturer`, labels, `kit_photo` + R2 bytes | Scope: competition + season `2010/11` (walk all clubs seeded in step 4) |

Steps 1–4 are Transfermarkt (Seed proxy / Decodo allowed). Step 5 is FKApi / fixture — **never Decodo** (transport lock).

### Postgres checklist (Club path)

| Entity | Complete when |
| --- | --- |
| `league` + TM ExternalId | `DK1` row exists |
| `season` | Label `2010/11` (or resolved canonical label) tied to Superliga |
| `club` | One row per competition-page club id (12 live ids) |
| Club facts + Honours | Rich grain columns / `honour` rows per KIT-143 accept |
| `team_season` | One row per club × `2010/11` |
| `player` + `player_club_season` | Squad with jersey `#` (+ position, DOB, nat, height, foot when on kader) for every club |
| `player_photo` | Portrait bytes for rows that had a kader image (same rights as KitPhoto) |
| `kit` | Match-category types per side (`home`, `away`, `third`, `special` when FKA lists it, `gk` for GK variants) — **`kit.club_id` set, `kit.national_team_id` null** |
| `kit.sponsor_name` / colour hex | Populated when source exposes them (FCK Carlsberg + colours confirmed) |
| `kit_photo` | ≥1 admin_only photo per kept kit type |

### R2 checklist (Club path)

| Object key pattern | Row |
| --- | --- |
| `kit/{kitExternalId}/…` (mapper-defined) | `kit_photo.object_key`, `rights=unresolved`, `visibility=admin_only` |
| `player/{tmPlayerId}/portrait` | `player_photo` when kader supplied a portrait |

Local / CI stand-in: `SEED_OBJECT_DIR` uses the same key layout without SigV4.

### Proof-season kit floor (Club)

Minimum match kits operators expect after FK join for **2010/11** (per club that FKA lists — FCK is the documented example):

| Side | Types kept (proof) | Example (FCK TM `190`) |
| --- | --- | --- |
| Each Superliga club | `home`, `away`, `third`, `special` (when FKA lists match-category rows), `gk` — drop Training / CL duplicates per fk-field-catalog | Home, Away, Third, **Special**, GK variants |

Exact per-club counts are source-driven; completeness means **every club with TM squad rows has at least the match kits FKA exposes for `10-11`**, not a fixed integer across all 12 clubs.

---

## NationalTeam path — Denmark men World Cup 2010

**Named season:** NationalTeam ref **`3436`** / alias `dk-men`, season **`2010`** (calendar WC year — not `2010/11`).

### Internal grain composition (Join workflow)

| Step | Grain / hop | Writes (Postgres) | Notes |
| --- | --- | --- | --- |
| 1 | **NationalTeam** | `national_team`, NT facts, **Honours**, TM `external_id` on **`national_team`** — never `club` | Denmark `3436` |
| 2 | **NationalTeam season** | `national_team_season`, `player`, `player_national_team_season`, Rich kader + optional **Player photo** | Calendar-year kader; tournament-squad-only cut stays **open** |
| 3 | **FK after facts** | `kit`, `kit_photo` + R2 bytes | Scope: `national-team 3436 2010` — FKA team `denmark-kits` |

### Postgres checklist (NationalTeam path)

| Entity | Complete when |
| --- | --- |
| `national_team` + TM ExternalId | Denmark row; **no** `club` row with id `3436` |
| `national_team_season` | NT × season `2010` |
| `player_national_team_season` | Squad with jersey `#` (+ call-up club, body facts when on `plus/1`) |
| `honour` | NT honours from `/erfolge/verein/3436` |
| `kit` | Match kits below — **`kit.national_team_id` set, `kit.club_id` null** |
| `kit_photo` | ≥1 admin_only photo per kept kit |

### R2 checklist (NationalTeam path)

Same as Club path — archive bytes only on `kit_photo` / `player_photo`; never hot-linked on collector surfaces.

### Proof-season kit floor (NationalTeam)

| Type (normalized) | FKA example id | Colours (observed) | Sponsor |
| --- | --- | --- | --- |
| `home` | `9857` | Red / White | null on match kits |
| `away` | `9858` | White / Red | null |
| `gk` | `60206`, `60205` | GK Home / GK Away palettes | null |

Training (`265170`, sponsor Arla) and other dropped categories must **not** appear as proof-complete rows.

---

## Catalog peek — eyeball contract

After a complete Join workflow run, `GET /v1/catalog/peek` on the lane API should show:

| Section | Club path | NationalTeam path |
| --- | --- | --- |
| Season heading | `2010/11` | `2010` (NT season label) |
| Side rows | Each Superliga club name + **squad count > 0** | Denmark + squad count > 0 |
| Kits under side | `home`, `away`, `third`, `special`, `gk`, … each with **photo count ≥ 1** | Same for four match kits |
| Missing | `no kits` under a club with TM squad → **not complete** | Same |

Peek does not prove hex colours or sponsor strings — Postgres / mapper tests do — but empty photo counts catch missing R2 writes.

---

## Seed run — operator protocol (ADR-0014)

Once KIT-146 implements the Join workflow module, the **human accept** for milestone 3 is one natural-language sentence per path — not grain-by-grain CLI.

| Path | Example sentence | Composes (internally) |
| --- | --- | --- |
| Club | “Seed Superliga 2010/11 including every club, squads, and kits into development.” | Steps 1–5 Club path |
| NationalTeam | “Seed Denmark men World Cup 2010 including squad and kits into development.” | Steps 1–3 NationalTeam path |

**Lane words:** default `development`; `staging` only when the sentence names it; **`production` rejected** (fail closed).

**Still true:** grains remain the documented public interface for milestone 1–2 tickets; the sentence is the Join milestone operator surface (ADR-0032). Cross MCP (milestone 4) wraps the same compose behind Seed MCP tools — not this research accept.

---

## Idempotency and isolation

| Rule | Join workflow behaviour |
| --- | --- |
| **Already seeded** (ADR-0010) | Skip TM fetch for club+season (or NT+season) that already has squad + `#`; still run FK if kits missing unless kits already complete |
| **ExternalId upsert** | Second Join run updates rows; no duplicate TM/FK ids |
| **Scope isolation** | Superliga walk does not mutate Denmark NT rows; Denmark walk does not mutate unrelated club seasons |
| **Forbidden fields** | Second run still strips market value, agent PII, branding |

---

## Grain CLI today vs Join module (KIT-146)

Today’s proof grains are **partial compose** — KIT-146 adds the full walk + Seed sentence entry:

| Today | Join workflow adds |
| --- | --- |
| `grain club-proof` → reads competition season page for club list, maps **Club** grain only (no `league` / `season` / squad rows) | **League season** + **Club season** for every club + FK pass |
| `grain national-team-proof` → NT + NT season | FK pass + single Seed sentence entry |
| Separate `seed-apify` walk / per-grain CLI | One module composing steps in catalog order |

Implementers treat this catalog as the **complete** checklist; partial grains remain for Hierarchy milestone tests until Join lands.

---

## HITL accept

- [ ] Nicklas accepts this catalog as the given compose list before KIT-146 starts.
- [ ] **Complete named season** = stamdata checklist + R2 checklist + peek contract for the path.
- [ ] Club path and NationalTeam path are **sibling compose** — not one mixed walk.
- [ ] One-sentence Seed run is documented as Join **operator protocol**, not milestone 1 accept.
- [ ] Superliga 2010/11 and Denmark WC 2010 proof floors match field-catalog and fk-field-catalog evidence.
