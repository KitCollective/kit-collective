# Coolify seed jobs

One-shot Docker Compose definitions for the same CLIs that Seed MCP wraps. They are **jobs**, not 24/7 services.

## Files

| File | CLI | When to run |
| --- | --- | --- |
| `docker-compose.apify-job.yml` | `@kit/seed-apify` | Transfermarkt facts for a competition + season range |
| `docker-compose.fkapi-job.yml` | `@kit/seed-fkapi` | FK kit identity + archive bytes **after** Apify for the same scope |

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

1. Build from repo root using `seed/coolify/Dockerfile` (local) or `seed/coolify/Dockerfile.remote` (Coolify API — clones public git at build time).
2. Import the compose file as a **Docker Compose** resource, **or** run `scripts/wire-coolify-seed-apify-job.sh` to create/update the development job via Coolify API.
3. Set restart policy to **never** / run as a one-shot job or cron.
4. Apply CPU/memory limits from the compose `deploy.resources` block.
5. Store secrets in the matching Coolify environment (`development` or `staging`).

Agents can trigger deploy/start via Coolify MCP once the resource exists (`control` on the service UUID).

**Cloud Agents:** `scripts/setup-coolify-mcp.sh` writes `.cursor/mcp.json` for the IDE. Agents also need the same HTTP server registered under **Cursor Dashboard → Integrations & MCP** so `GetMcpTools` lists `coolify` in-session. Starting a run from chat uses the Coolify MCP `control` tool — see `seed/coolify/start-apify-job.sh` (not the Coolify REST `/start` endpoint).
