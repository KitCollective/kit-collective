# KIT-252 retest 2026-09-17

## Verdict: `PARTIAL`

- type hits: 3
- player hits: 0 (juve back photo player=False)
- KIT-251 Barca spot: `PASS` (clubHint=FC Barcelona)

### Per target
- j1-juventus-pink-away: {'status': 'ready', 'club': True, 'season': True, 'type': True, 'player': False, 'labels': {'clubLabel': 'Juventus FC', 'seasonLabel': '2015/16', 'type': 'away'}}
- j5-arsenal-red-home-125: {'status': 'ready', 'club': True, 'season': False, 'type': True, 'player': False, 'labels': {'clubLabel': 'Arsenal Football Club', 'type': 'home'}}
- j8-psg-white-jordan: {'status': 'ready', 'club': True, 'season': True, 'type': True, 'player': False, 'labels': {'clubLabel': 'Paris Saint-Germain', 'seasonLabel': '2019/20', 'type': 'away'}}
- j17-mancity-sky-home: {'status': 'noop', 'club': False, 'season': False, 'type': False, 'player': False, 'labels': {}}

### Extra
```json
[
  {
    "tag": "city",
    "jerseyId": "j17-mancity-sky-home",
    "file": "IMG_9173.jpg",
    "angle": "front",
    "expectPlayer": "Haaland",
    "expectType": "home",
    "status": "noop",
    "fieldPreselect": null,
    "suggestions": {},
    "secs": 3.8,
    "jobId": "a387e790-794d-454c-8ee1-9a0ec84f6129"
  },
  {
    "tag": "juve_back",
    "jerseyId": "j1-juventus-pink-away",
    "file": "07790B00-08EE-4EB0-ACC9-22E4F761EF66.jpg",
    "angle": "back",
    "expectPlayer": "Dybala",
    "expectType": "away",
    "status": "ready",
    "fieldPreselect": {
      "club": true,
      "season": true,
      "type": true
    },
    "suggestions": {
      "clubId": "764918f7-6603-4c18-8d1b-c7e26d665330",
      "seasonId": "49795dc2-ffe1-43ad-acb0-4224a399a7ce",
      "type": "away",
      "clubLabel": "Juventus FC",
      "seasonLabel": "2012/13"
    },
    "secs": 4.0,
    "jobId": "22ab299e-7b42-4ec2-8b4a-ffeb58214398"
  }
]
```

Baseline 2026-09-16: type 0/4, player 0/4.
