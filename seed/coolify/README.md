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
| `SEED_PROXY_URL` | yes (live Kader on Coolify) | when FK origin 202s from CX33 |
| `SEED_REQUIRE_PROXY` | recommended `true` on Coolify | recommended `true` on Coolify |
| `SEED_TRANSFERMARKT_REQUEST_DELAY_MS` | optional (default `1500`) | — |
| `SEED_TRANSFERMARKT_RETRY_MAX_ATTEMPTS` | optional (default `3`) | — |
| `SEED_TRANSFERMARKT_RETRY_BASE_DELAY_MS` | optional (default `1000`) | — |
| `SEED_TRANSFERMARKT_RATE_LIMIT_STOP_AFTER` | optional (default `3`) | — |
| `APIFY_TOKEN` | only when `SEED_FETCH=apify` | — |
| `FKAPI_BASE_URL` | — | yes (live listings; not fixture JSON) |
| `FKAPI_TOKEN` | — | when FK origin requires auth |
| `R2_*` | — | yes (lane bucket only) |

## Coolify setup

1. Build from repo root using `seed/coolify/Dockerfile` (local) or `seed/coolify/Dockerfile.remote` (Coolify API — clones public git at build time). The job container runs the **prebuilt** CLI from `seed/apify/dist/cli.js`; it does not `pnpm install` or compile TypeScript at start.
2. Import the compose file as a **Docker Compose** resource, **or** run `scripts/wire-coolify-seed-apify-job.sh` to create/update the development job via Coolify API (embeds `Dockerfile.remote` as `dockerfile_inline` so the CX33 host does not need a git checkout for build context).
3. Set restart policy to **never** / run as a one-shot job or cron.
4. Set the cgroup memory cap with compose **`mem_limit`** (e.g. `512m` on the Apify job). Coolify on this host does **not** enforce Swarm-only `deploy.resources.limits.memory`; use `mem_limit` so the one-shot job is capped for Node CLI RAM, not a full monorepo install + `tsc`.
5. Store secrets in the matching Coolify environment (`development` or `staging`).

For Decodo residential proxies, `SEED_PROXY_URL` may include optional sticky-session username parameters `session` and `sessionduration` (document names only in git; set values in Coolify). Omit `session` for rotating IPs.

Decodo **Site Unblocker** uses host `unblock.decodo.com` port `60000` (HTTP proxy, not `POST /v2/scrape`). The seed CLI detects that host, disables TLS verification on the proxy dispatcher only, and sends `X-SU-Geo: Germany`. Do not enable Unblocker JS rendering for kader HTML.

Agents can trigger deploy/start via Coolify MCP once the resource exists (`control` on the service UUID).

**Cloud Agents:** `scripts/setup-coolify-mcp.sh` writes `.cursor/mcp.json` for the IDE. Agents also need the same HTTP server registered under **Cursor Dashboard → Integrations & MCP** so `GetMcpTools` lists `coolify` in-session. Starting a run from chat uses the Coolify MCP `control` tool — see `seed/coolify/start-apify-job.sh` (not the Coolify REST `/start` endpoint).
