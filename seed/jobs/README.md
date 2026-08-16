# Coolify seed jobs

Same CLIs as Seed MCP, run as **one-shot jobs** on the CX33. Not 24/7 services beside Nest.

| File | CLI |
| --- | --- |
| `apify.compose.yaml` | Apify / Transfermarkt |
| `fk.compose.yaml` | Football Kit Archive |

Limits: 1 CPU, 1 GiB RAM, 256 PIDs, `restart: "no"`, no published ports.

## Attach in Coolify

1. Project **KitCollective**, environment **development** (or **staging** only when that lane is named). Never the production environment.
2. Add a Docker Compose resource pointing at the matching file in this directory.
3. Set `DATABASE_URL` from that lane’s volume. FK also needs the lane’s R2 names (`R2_*` in `.env.example`).
4. Per run, set `SEED_COMPETITION`, `SEED_FROM_SEASON`, `SEED_TO_SEASON`. `SEED_LANE` defaults to `development`.
5. Start / redeploy the resource. It must exit. Do not enable always-on or a healthcheck URL.

`0001` is the competition’s first season. Run the Apify job for a scope before the FK job.

Production is rejected by `run.ts` (same lane policy as Seed MCP).
