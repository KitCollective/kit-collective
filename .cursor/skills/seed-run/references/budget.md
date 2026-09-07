# Seed run budget

Live Transfermarkt GETs sleep **1500 ms** between requests (`SEED_TRANSFERMARKT_REQUEST_DELAY_MS`). Retries on 403/429: 3 attempts, exponential backoff from 1000 ms. Circuit opens after **3** consecutive exhausted 403/429 URLs (`SEED_TRANSFERMARKT_RATE_LIMIT_STOP_AFTER`).

| Class | What it fetches | Cost shape |
| --- | --- | --- |
| `grain league` | Competition identity | One search / catalog hop |
| `grain league-season` | Season page + club list | One competition season page |
| `grain club` | Profile + facts + honours | A handful of TM pages |
| `grain club-season` | Kader `plus/1` (+ profile hops if id/`#` missing) | One squad page; hops add up per missing row |
| `grain club-proof` | Club identity for **every** club on that competition season page (no kader, no FK) | Superliga 2010/11 ≈ 12 club profile fetches |
| `join club` Superliga 2010/11 | League → season → **12** clubs → **12** kaders → FK kits | Full named season. Confirm with the human before starting |
| `join national-team` Denmark 2010 | NT → NT season kader → FK kits | One side, still many player hops |
| `join sentence` | Parsed ADR-0014 proof sentence | Same as the matching join path |

Desktop TM is the **local IP** (no Decodo bill) unless `SEED_TM_TRANSPORT=proxy`. Decodo is per-GB on Coolify; do not spend it from Desktop by default.

FK listing (Wayback behind `FKAPI_BASE_URL`) is not Decodo. Fixture FK (`SEED_FK_FETCH=fixture`) is free and is Hierarchy proof kits, not live archive ingest.

Already seeded (ADR-0010) skips a club+season that already has a numbered squad — a second `join club` on the same season should skip TM fetch for those pairs.
