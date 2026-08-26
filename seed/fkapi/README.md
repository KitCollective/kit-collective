# FK seed CLI (`seed/fkapi`)

Football Kit Archive ingest for Kit identity and archive `KitPhoto` rows.

**Placement:** interim in this monorepo per [ADR 0001](../../docs/adr/0001-interim-fk-seed-in-monorepo.md). Handoff for the future standalone repo: [spec/handoff.md](./spec/handoff.md).

## CLI shape (shared seed contract)

```bash
DATABASE_URL=... pnpm --filter @kit/seed-fkapi seed -- <competition> <from-season> <to-season> <lane>
```

- `competition` — e.g. `superliga`, `championship`
- `from-season` — season label or `0001` (first season for that competition)
- `to-season` — season label or `today`
- `lane` — `development` or `staging` (`production` is rejected)

Same positional contract as the future Apify seed CLI (not yet implemented in any repo).

Requires Apify seed club + season rows for the scope before FK seed runs.

## Environment

- `DATABASE_URL` — lane Postgres (required)
- `R2_*` — object store for archive bytes (SigV4 via `@aws-sdk/client-s3`)
- `FKAPI_BASE_URL`, `FKAPI_TOKEN` — required for live fetch; omitted in tests
- `SEED_PROXY_URL`, `SEED_REQUIRE_PROXY` — Coolify jobs fail closed without proxy when required

## Tests

```bash
pnpm --filter @kit/seed-fkapi test
```

Tests use fixture JSON and in-memory object store. No Football Kit Archive or Apify network calls.
