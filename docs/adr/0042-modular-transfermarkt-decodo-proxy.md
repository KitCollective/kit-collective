# Modular Transfermarkt Decodo proxy

Live Transfermarkt HTTP transport is one module: `resolveTransfermarktTransport` in `@kit/seed-shared`. Callers do not each interpret `SEED_PROXY_*`.

- **Coolify / server:** `SEED_REQUIRE_PROXY` truthy (or `SEED_TM_TRANSPORT=proxy`) → Decodo via `SEED_PROXY_URL`. Missing URL fails closed.
- **Desktop / local:** default is the machine’s own IP, even when `SEED_PROXY_URL` is present in env. Opt in to Decodo with `SEED_TM_TRANSPORT=proxy`.
- **Football Kit Archive:** Coolify listing HTTP (`FKAPI_BASE_URL`, ADR-0041 / Wayback). Never Decodo. Never a Desktop scrape of footballkitarchive.com.

Decodo Site Unblocker (ADR-0017) remains the Coolify TM proxy vendor. `POST /v2/scrape` stays out. Nest still never hits Transfermarkt.

Status: accepted, superseded in part by ADR-0043 — the Desktop default is now the proxy whenever `SEED_PROXY_URL` is set, with `SEED_TM_TRANSPORT=direct` as the opt-out.
Supersedes: CONTEXT **Seed proxy** and ADR-0017 only on “`kc_seed_mcp` / any process with `SEED_PROXY_URL` set always uses Decodo”. Local grain uses the local IP unless `SEED_TM_TRANSPORT=proxy`.
