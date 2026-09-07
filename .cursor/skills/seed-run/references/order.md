# Join order

The CLI already composes this. Run `join`, or a single named grain — do not hand-walk the list unless the human named one grain.

## Club path — `join club <competition> <season>`

Source: [compose-catalog.md](../../../../.scratch/football-data-seed/compose-catalog.md). Superliga 2010/11 is **12** clubs.

1. **League** — competition identity
2. **League season** — season page; club ids come from here
3. **Club** × N — profile, facts, honours
4. **Club season** × N — kader `plus/1` (+ profile hops when id/`#` missing)
5. **FK after facts** — kits + photos. Listing HTTP / fixture. Never Decodo.

Already seeded (ADR-0010) skips a club+season that already has jersey numbers.

## NationalTeam path — `join national-team <ntRef> <season>`

1. **NationalTeam** — identity, facts, honours (never a `club` row)
2. **NationalTeam season** — calendar-year kader
3. **FK after facts** — kits + photos. Never Decodo.

Denmark men WC 2010: `ntRef` `3436` or alias `dk-men`, season `2010` (not `2010/11`).

## Named one club (not Join)

Human named one side (e.g. FCK). Club TM ids: [field-catalog.md](../../../../.scratch/football-data-seed/field-catalog.md) (FCK is `190`).

1. `grain club <competition> <clubId>`
2. `grain club-season <competition> <clubId> <season>`
3. Kits: `node --env-file=.env seed/fkapi/dist/cli.js club <competition> <clubId> <season> [lane]`
