# Coolify seed jobs

One-shot Docker Compose definitions for the same CLIs that Seed MCP wraps. They are **jobs**, not 24/7 services.

## Files

| File | CLI | When to run |
| --- | --- | --- |
| `docker-compose.apify-job.yml` | `@kit-collective/seed-apify` | Transfermarkt facts for a competition + season range |
| `docker-compose.fkapi-job.yml` | `@kit-collective/seed-fkapi` | FK kit identity + archive bytes **after** Apify for the same scope |

## Lane rules

- Default `SEED_LANE=development` (CX33 development Postgres + R2 bucket).
- Set `SEED_LANE=staging` only when intentionally filling the staging catalog.
- **Do not** configure production credentials on these jobs. Production seed from chat/tools is rejected.

## Required environment

| Variable | Apify job | FK job |
| --- | --- | --- |
| `SEED_COMPETITION` | yes | yes |
| `SEED_FROM_SEASON` | yes (`0001` = first season) | yes |
| `SEED_TO_SEASON` | yes (`today` allowed) | yes |
| `SEED_LANE` | optional (default development) | optional |
| `DATABASE_URL` | yes | yes |
| `APIFY_TOKEN` | when live fetch is enabled | — |
| `R2_*` | — | yes (lane bucket only) |

## Coolify setup

1. Build from repo root using `seed/coolify/Dockerfile`.
2. Import the compose file as a **Docker Compose** resource.
3. Set restart policy to **never** / run as a one-shot job or cron.
4. Apply CPU/memory limits from the compose `deploy.resources` block.
5. Store secrets in the matching Coolify environment (`development` or `staging`).

Agents can also trigger the same command via Coolify MCP once the resource exists.
