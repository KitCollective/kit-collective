# Coolify seed

Two kinds of Coolify resources share `seed/coolify/Dockerfile`:

| Kind | File | Restart | When |
| --- | --- | --- | --- |
| **24/7 Seed MCP HTTP** | `docker-compose.mcp.yml` + Coolify **application** `seed-mcp` | `unless-stopped` | Ingest chat (`seed_grain` / `seed_join`) on its own hostname |
| One-shot Apify job | `docker-compose.apify-job.yml` | `"no"` | Transfermarkt facts for a competition + season range |
| One-shot FK job | `docker-compose.fkapi-job.yml` | `"no"` | FK kit identity + archive bytes **after** Apify for the same scope |

The MCP container is a long-running HTTP process (`node seed/mcp/dist/http.js`, `PORT` 8787, path `/mcp`). Cursor id stays `kc_seed_mcp`. Coolify assigns a unique auto-FQDN (sslip.io until named DNS exists) that must never be Coolify’s MCP URL.

**Ingest chat uses `SEED_MCP_URL` only.** Do not start a Seed scope with Coolify `control`. Coolify MCP stays Docker and host catalog.

## 24/7 Seed MCP application

1. Prefer a git-connected Coolify **application** (not a compose job). Coolify’s Docker context for a nested Dockerfile is `seed/coolify/`, so the app uses `dockerfile_location` `/seed/coolify/Dockerfile.remote` (clones the repo in the image). Local compose still builds `seed/coolify/Dockerfile` from the monorepo root. Default image `CMD` is HTTP; jobs override `command`.
2. Run `seed/coolify/wire-mcp.sh` or GitHub Action **Wire Coolify Seed MCP** (`workflow_dispatch`, GitHub Environment `development` only). Default `SEED_LANE=development`. Production is refused.
3. Coolify API credentials (`COOLIFY_API_URL`, `COOLIFY_API_TOKEN`) talk to the host API. They are **not** copied into the Seed MCP process. The ingest token is `SEED_MCP_TOKEN` (required, fail closed) — a different secret.
4. Health check: `GET /mcp` expecting **401** (unauthenticated is denied; the process is up). The image installs `curl` so Coolify can probe from inside the container.
5. After create, the script prints the FQDN. Set client `SEED_MCP_URL` to `https://{fqdn}/mcp` (or `http://{fqdn}/mcp` if TLS is off). **Do not commit that value.**
6. `mem_limit` is at least 1g (Join runs inside this process). Compose uses `2048m`.
7. When `FKAPI_BASE_URL` is unset, the service sets `SEED_FK_FETCH=fixture`. Omit every `COOLIFY_*` name from the process env.

## One-shot jobs

One-shot Docker Compose definitions for the same CLIs that Seed MCP wraps. They are **jobs**, not 24/7 services.

| File | CLI | When to run |
| --- | --- | --- |
| `docker-compose.apify-job.yml` | `@kit/seed-apify` | Transfermarkt facts for a competition + season range |
| `docker-compose.fkapi-job.yml` | `@kit/seed-fkapi` | FK kit identity + archive bytes **after** Apify for the same scope |

## Lane rules

- Default `SEED_LANE=development` (CX33 development Postgres + R2 bucket).
- Set `SEED_LANE=staging` only when intentionally filling the staging catalog.
- **Do not** configure production credentials on these jobs. Production seed from chat/tools is rejected.

## Required environment

| Variable | Seed MCP app | Apify job | FK job |
| --- | --- | --- | --- |
| `SEED_MCP_TOKEN` | yes (fail closed) | — | — |
| `SEED_FK_FETCH` | `fixture` when `FKAPI_BASE_URL` unset | — | — |
| `SEED_COMPETITION` | via MCP tool args | yes | yes |
| `SEED_FROM_SEASON` | via MCP tool args | yes (`0001` = first season) | yes |
| `SEED_TO_SEASON` | via MCP tool args | yes (`today` allowed) | yes |
| `SEED_LANE` | optional (default development) | optional | optional |
| `DATABASE_URL` | yes | yes | yes |
| `SEED_STAGING_DATABASE_URL` | when targeting staging | — | — |
| `SEED_PROXY_URL` | yes (live Kader on Coolify) | yes (live Kader on Coolify) | when FK origin 202s from CX33 |
| `SEED_REQUIRE_PROXY` | recommended `true` on Coolify | recommended `true` on Coolify | recommended `true` on Coolify |
| `SEED_TRANSFERMARKT_REQUEST_DELAY_MS` | optional (default `1500`) | optional (default `1500`) | — |
| `SEED_TRANSFERMARKT_RETRY_MAX_ATTEMPTS` | optional (default `3`) | optional (default `3`) | — |
| `SEED_TRANSFERMARKT_RETRY_BASE_DELAY_MS` | optional (default `1000`) | optional (default `1000`) | — |
| `SEED_TRANSFERMARKT_RATE_LIMIT_STOP_AFTER` | optional (default `3`) | optional (default `3`) | — |
| `APIFY_TOKEN` | only when `SEED_FETCH=apify` | only when `SEED_FETCH=apify` | — |
| `FKAPI_BASE_URL` | live listings; else fixture | — | yes (live listings; not fixture JSON) |
| `FKAPI_TOKEN` | when FK origin requires auth | — | when FK origin requires auth |
| `R2_*` | yes (lane bucket; Join writes photos) | — | yes (lane bucket only) |

## Coolify setup (jobs)

1. Build from repo root using `seed/coolify/Dockerfile` (local) or `seed/coolify/Dockerfile.remote` (Coolify API — clones public git at build time). The job container runs the **prebuilt** CLI from `seed/apify/dist/cli.js`; it does not `pnpm install` or compile TypeScript at start.
2. Import the compose file as a **Docker Compose** resource, **or** run `scripts/wire-coolify-seed-apify-job.sh` to create/update the development job via Coolify API (embeds `Dockerfile.remote` as `dockerfile_inline` so the CX33 host does not need a git checkout for build context).
3. Set restart policy to **never** / run as a one-shot job or cron.
4. Set the cgroup memory cap with compose **`mem_limit`** (e.g. `512m` on the Apify job). Coolify on this host does **not** enforce Swarm-only `deploy.resources.limits.memory`; use `mem_limit` so the one-shot job is capped for Node CLI RAM, not a full monorepo install + `tsc`.
5. Store secrets in the matching Coolify environment (`development` or `staging`).

For Decodo residential proxies, `SEED_PROXY_URL` may include optional sticky-session username parameters `session` and `sessionduration` (document names only in git; set values in Coolify). Omit `session` for rotating IPs.

Decodo **Site Unblocker** uses host `unblock.decodo.com` port `60000` (HTTP proxy, not `POST /v2/scrape`). The seed CLI detects that host, disables TLS verification on the proxy dispatcher only, and sends `X-SU-Geo: Germany`. Do not enable Unblocker JS rendering for kader HTML.

Agents can trigger **job** deploy/start via Coolify MCP once the resource exists (`control` on the service UUID). That path is **not** ingest — ingest stays on `SEED_MCP_URL`.

**Cloud Agents:** `scripts/setup-coolify-mcp.sh` writes `.cursor/mcp.json` for the IDE. Agents also need the same HTTP server registered under **Cursor Dashboard → Integrations & MCP** so `GetMcpTools` lists `coolify` in-session. Starting a **job** run from chat uses the Coolify MCP `control` tool — see `seed/coolify/start-apify-job.sh` (not the Coolify REST `/start` endpoint). Seed MCP HTTP is a different Cursor server (`kc_seed_mcp`) pointed at `SEED_MCP_URL`.
