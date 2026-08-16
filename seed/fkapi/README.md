# FK seed CLI (`seed/fkapi`)

Football Kit Archive ingest for Kit identity and archive `KitPhoto` rows.

## CLI shape (matches Apify seed)

```bash
DATABASE_URL=... pnpm --filter @kit/seed-fkapi seed -- <competition> <from-season> <to-season> <lane>
```

- `competition` — e.g. `superliga`, `championship`
- `from-season` — season label or `0001` (first season for that competition)
- `to-season` — season label or `today`
- `lane` — `development` or `staging` (`production` is rejected)

Requires Apify seed club + season rows for the scope before FK seed runs.

## Environment

- `DATABASE_URL` — lane Postgres (required)
- `R2_*` — object store for archive bytes (production runs only)
- `FKAPI_BASE_URL`, `FKAPI_TOKEN` — optional; real fetch adapter only

## Tests

```bash
pnpm --filter @kit/seed-fkapi test
```

Tests use fixture JSON and in-memory object store. No Football Kit Archive or Apify network calls.
