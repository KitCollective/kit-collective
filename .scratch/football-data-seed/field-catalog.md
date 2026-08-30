# Field catalog — Transfermarkt & Football Kit Archive

**Issue:** [KIT-138](https://linear.app/kitcollective/issue/KIT-138/vendor-research-for-transfermarkt-and-football-kit-archive)  
**Accept:** Nicklas signs off this catalog before any other Football Data Seed issue starts.  
**Breadth:** Hierarchy proof only — Superliga **2010/11** (`DK1`, `saison_id=2010`) and Denmark men **World Cup 2010** (TM national side `verein/3436`, calendar `saison_id=2010`). Not every league.  
**Classifications:** `stamdata now` | `later leverage` | `drop`  
**Hard drops (ADR-0002):** market value, agent PII, Transfermarkt / FKA branding (logos, profile URLs as product assets).

Seed-module interfaces live beside the trees:

- Transfermarkt grains → [`seed/apify/reference.md`](../../seed/apify/reference.md)
- Football Kit Archive grains → [`seed/fkapi/reference.md`](../../seed/fkapi/reference.md)

---

## Evidence (this pass)

| Source | What |
| --- | --- |
| Repo | `seed/apify` parsers/types/normalize; `seed/fkapi` types/normalize/fixture; `packages/db` kit/club/national_team schema; ADR-0002, ADR-0032; CONTEXT Rich grain |
| Live TM HTML 200 | Superliga 2010/11 competition; FCK kader `plus/1`; FCK club + facts; player profil / rückennummern / erfolge; Denmark kader ± `plus/1` |
| Live FKA HTML | **403** (homepage + club/national kit paths) without Seed proxy this session |
| FKApi docs | Unofficial scraper API named by `FKAPI_BASE_URL` — [data models](https://mintlify.wiki/sunr4y/fkapi/concepts/data-models): type, brand, primary/secondary colour, image; **no sponsor field** |

---

## Proof-season page map

| Grain | Vendor page (observed) |
| --- | --- |
| League season | `…/superligaen/startseite/wettbewerb/DK1/saison_id/2010` |
| Club season | `…/kader/verein/{id}/saison_id/2010/plus/1` |
| Club | `…/startseite/verein/{id}`, `…/datenfakten/verein/{id}` |
| Player (hop) | `…/profil/spieler/{id}` (+ `/rueckennummern`, `/erfolge` for later) |
| NationalTeam | `…/daenemark/startseite/verein/3436` |
| NationalTeam season | `…/daenemark/kader/verein/3436/saison_id/2010` (+ `/plus/1`) |
| Kit | FKApi / FKA after Club or NationalTeam + Season exist |

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
| Per-club squad size / ø-age / foreigners | later leverage | Optional |
| Market-value columns | drop | ADR-0002 |
| Fixtures / standings / scorers | drop | Out of Football Data Seed stamdata |

### Club — Transfermarkt

| Field | Class | Note |
| --- | --- | --- |
| TM club id, display name, country | stamdata now | ExternalId + CatalogLabel |
| Official name, founded, stadium, capacity, club colour swatches, website | later leverage | **Club facts** (Rich Club grain) |
| Address / Tel / Fax | drop | Contact / PII-adjacent |
| Current squad stats, transfer record, table position (homepage = current season) | drop / later with caveat | Not 2010/11-frozen without confirm |
| TM crest / `tmLogoUrl` / profile URL | drop | ADR-0002 |
| Kit manufacturer on club page | open | Not observed on FCK facts this pass — kits are FK grain |

### Club season — Transfermarkt kader `plus/1`

**Observed headers (FCK 2010/11):** `#`, Player, Date of birth/Age, Nat., Current club, Height, Foot, Joined, Signed from, Market value.  
**Parser today:** jersey `#`, player id, player name only.

| Field | Class | Note |
| --- | --- | --- |
| Club id + season id; player id; name; jersey `#` | stamdata now | TeamSeason + Player + PlayerClubSeason |
| Position, DOB, nationality, height, foot | later leverage | On `plus/1` already — no profile hop required for these |
| Joined / Signed from / Current club | drop until proven | Sample rows polluted with present-day dates |
| Market value | drop | ADR-0002 |
| Loan / parent-club markers | open | Not on FCK 2010 sample; **Player registration** stays open |
| Portraits / TM hrefs | drop | Branding |

### NationalTeam — Transfermarkt

| Field | Class | Note |
| --- | --- | --- |
| TM id (`3436`), name, country | stamdata now | Map to **`national_team`**, never `club` |
| Gender | stamdata now | Ours (men first proof) |
| Official association name, founded, confederation | later leverage | Depth |
| FIFA ranking on live page | drop / later with timestamp | Current framing |
| Address / Tel / Fax; TM crest | drop | Same rules as Club |

### NationalTeam season — Transfermarkt

| Field | Class | Note |
| --- | --- | --- |
| `saison_id=2010`; squad player ids; jersey `#` when set | stamdata now | NT season grain |
| Parent club (call-up), DOB, height, foot | later leverage | NT `plus/1` |
| Caps / goals / debut columns | later leverage | Confirm career-to-date vs season |
| Market value | drop | ADR-0002 |
| WC-2010-only 23-man list | open | Calendar-2010 kader had ~57 players; FIWC participant HTML empty this session — **Tournament squad** still needs confirm |

### Player — Transfermarkt

| Field | Class | Note |
| --- | --- | --- |
| TM player id, display name | stamdata now | ExternalId + CatalogLabel |
| Home-country name, DOB, place of birth, citizenship, height, foot, position, youth clubs | later leverage | Profile depth |
| Honours (`/erfolge`), jersey history (`/rueckennummern`) | later leverage | **Player honours** / career `#` |
| Agent / agency; market value; contract; portraits; boot outfitter | drop | ADR-0002 / not kit |
| Current shirt number on profile | later / hop-only | **Current** club `#`, not historical season |

### Player season — Transfermarkt

| Field | Class | Note |
| --- | --- | --- |
| Player + Club or NationalTeam + Season + jersey `#` | stamdata now | Club path → `player_club_season`; NT path needs sibling mapping (not invent a column here) |
| Position that season | later leverage | |
| Appearances / goals; loan registration | open | Not on observed kader columns |
| Market value “as of season” | drop | Historical kader shows current MV |

### Kit — Football Kit Archive / FKApi

| Field | Class | Note |
| --- | --- | --- |
| FK kit id; type (`home\|away\|third\|gk\|special`); manufacturer/brand name; season label | stamdata now | Kit + Manufacturer + CatalogLabel |
| Club join via `clubTransfermarktId` | stamdata now | Adapter join after TM Club+Season |
| Archive image bytes → KitPhoto `admin_only` / `rights: unresolved` | stamdata now | Never Expo/Astro/OG |
| English kit label | later leverage | Optional CatalogLabel |
| Primary / secondary colours (name + hex) | later leverage | In FKApi models; **not** in our `FkRawKit` yet — **Kit colours** |
| Sponsor | open | DB has `sponsor_name`; FKApi models lack sponsor; FKA HTML 403 — do not claim until live confirm |
| Design, competition tags | later leverage | |
| Rating, brand/club logos, FKA page URL as product asset | drop | Branding / noise |
| NationalTeam kit join | open + gap | Spec requires sibling grain; current mapper only resolves TM **club** ExternalId |

---

## Stamdata now (proof accept)

TM competition id/slug/name/country · season id+label · club id+name+country · club-season squad (player id, name, `#`) · NationalTeam id+name+gender+country · NT-season squad (`#` when present) · Player id+name · FK kit id, type, manufacturer, season join, TM-side club join ids, archive bytes.

## Later leverage (on page / in FKApi, not required for first Hierarchy accept)

Club facts · kader DOB/nat/height/foot/position · player profile depth + honours + jersey history · NT caps/debut/parent club · Kit colours (and sponsor **if** confirmed) · kit design/competition tags.

## Drop

All market value · agent/agency · TM and FKA logos & profile URLs as product assets · contact address/phone/fax · transfer fees/records · boot outfitter · Joined/Signed-from until proven season-true.

## Open confirms (do not invent)

1. FKA HTML for FCK 2010/11 + Denmark 2010 (sponsor text, colour chips, national team-page shape) — needs Seed proxy.
2. WC-2010-only **Tournament squad** vs calendar-2010 NT kader.
3. FIWC participant/squad HTML when not empty.
4. Whether historical Joined / Signed from / Current club can be trusted for 2010/11.
5. Loan / registration markers on other Superliga 2010/11 clubs.
6. Whether live `FKAPI_BASE_URL` exposes colours/sponsor beyond the OSS schema.
7. NationalTeam kit ExternalId join key (TM `3436` vs FKA team slug).

---

## HITL accept

- [ ] Nicklas accepts this catalog (and the Seed references) as the given field list for later Football Data Seed issues.
- [ ] Open confirms stay open — later milestone research (KIT-140 FK depth, NT tournament page) may promote fields; they do not block Hierarchy grain tickets from using **stamdata now**.
