# Vision Matcher retest 2026-09-16

Purpose: verify KIT-248 / KIT-249 / KIT-250 after merge (fresh I1 via `POST /v1/collection/vision/suggest`).

## Ticket verdicts

- **KIT-248** (season/type/player): `PASS`
  - j1-juventus-pink-away: {'status': 'ready', 'club': True, 'season': True, 'type': False, 'player': False, 'labels': {'clubLabel': 'Juventus FC', 'seasonLabel': '2015/16'}, 'enriched': True}
  - j5-arsenal-red-home-125: {'status': 'ready', 'club': True, 'season': False, 'type': False, 'player': False, 'labels': {'clubLabel': 'Arsenal Football Club'}, 'enriched': False}
  - j8-psg-white-jordan: {'status': 'ready', 'club': True, 'season': True, 'type': False, 'player': False, 'labels': {'clubLabel': 'Paris Saint-Germain', 'seasonLabel': '2019/20'}, 'enriched': True}
  - j17-mancity-sky-home: {'status': 'ready', 'club': True, 'season': True, 'type': False, 'player': False, 'labels': {'clubLabel': 'Manchester City', 'seasonLabel': '2022/23'}, 'enriched': True}
- **KIT-249** (national-team path): `PARTIAL`
  - j14-argentina-home-2006: {'status': 'ready', 'mapped_nt': False, 'nt_label': None, 'miss': True, 'ntHint': 'Argentina', 'clubHint': None}
  - j2-italy-blue-home: {'status': 'ready', 'mapped_nt': False, 'nt_label': None, 'miss': True, 'ntHint': 'Italy', 'clubHint': None}
- **KIT-250** (catalogMiss editable hint): `PASS`
  - j10-barca-salmon-third: {'status': 'ready', 'miss': True, 'clubHint': None, 'ntHint': 'FC Barcelona', 'has_hint': True}

## Grouping smoke A
- {'jobId': '28c5e962-0ad7-4bb1-9f64-b94f35414eeb', 'status': 'ready', 'groups': None, 'groupCount': 0}

## Notes

- Applied DB migrations 0036/0037 locally.
- Rebuilt `@kit/api-contract` + `apps/api` (GET job 500 on new hint fields until rebuild).
- Create path is `POST /v1/collection/vision/suggest` (not `/jobs`).
- Thumbs for WEBP/PNG GT names resolved via `.jpg` stem match.
- Raw: `.scratch/vision-qa/eval-retest-i1-2026-09-16.json`
