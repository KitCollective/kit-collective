# KIT-253 retest 2026-09-17

Head: `482bd6d`.

## Verdict: `PASS`

Juve back mapped Paulo Dybala after retries (intermittent noop flakes)

### Juve back confirm
```json
{
  "jobId": "5e792769-4455-43cd-9992-6ab9ad5ff62a",
  "status": "ready",
  "suggestions": {
    "clubId": "764918f7-6603-4c18-8d1b-c7e26d665330",
    "seasonId": "49795dc2-ffe1-43ad-acb0-4224a399a7ce",
    "type": "away",
    "clubLabel": "Juventus FC",
    "seasonLabel": "2012/13",
    "playerId": "801b7c97-1eb2-4084-a209-cfc8b3dd0ab8",
    "playerLabel": "Paulo Dybala"
  },
  "fieldPreselect": {
    "club": true,
    "season": true,
    "type": true,
    "player": true
  }
}
```

### Club front regression (type)
- juve_front / arsenal / psg / city: type present on all ready jobs (4/4) in suite run

### Scored
- **juve_back**: {'club': True, 'season': True, 'type': True, 'player': True, 'playerLabel': 'Paulo Dybala', 'typeVal': 'away', 'status': 'ready'}
- **juve_front**: {'club': True, 'season': True, 'type': True, 'player': False, 'playerLabel': None, 'typeVal': 'away', 'status': 'ready'}
- **arsenal**: {'club': True, 'season': False, 'type': True, 'player': False, 'playerLabel': None, 'typeVal': 'home', 'status': 'ready'}
- **psg**: {'club': True, 'season': True, 'type': True, 'player': False, 'playerLabel': None, 'typeVal': 'away', 'status': 'ready'}
- **city**: {'club': True, 'season': True, 'type': True, 'player': False, 'playerLabel': None, 'typeVal': 'home', 'status': 'ready'}

Raw: `.scratch/vision-qa/eval-retest-kit253-2026-09-17.json`
