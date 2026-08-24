# PI worker host

Dedicated Agent-harness box. Not the product app host. Do not install the product PaaS panel here.

| Field | Value |
| --- | --- |
| Role | PI factory worker (webhook + one Pi job) |
| Hetzner name | `kit-harness` |
| Hetzner server id | `416348660` |
| SKU | CX33 (4 vCPU / 8 GB / 80 GB). Ticket KIT-53 said CX23; Nicklas sized up. |
| Location | Helsinki, Finland (`eu-central`) |
| IPv4 | `62.238.125.114` |
| IPv6 | `2a01:4f9:c015:40af::/64` |
| Public hostname | `harness.eskobar.dev` (DNS may lag provisioning) |
| SSH | `ssh kit-harness` after installing `harness/ssh-config.example` |
| SSH user | `root` |
| SSH key (local) | `~/.ssh/hetzner_key` — never commit the private key |
| Traffic | 20 TB outbound included |
| Backups | off at create time |

Product Postgres, Redis, and the PaaS panel stay on the other Helsinki CX33. This box has no `DATABASE_URL`.

## Runtime

- Deploy dir: `/opt/kit-collective/harness`
- Compose: `docker compose up -d` (webhook behind Caddy)
- Health: `https://harness.eskobar.dev/health` → `{"ok":true}`
- TLS: Let’s Encrypt via Caddy
- Worker `.env` on the box only — never git. Path: `/opt/kit-collective/harness/.env` (compose `env_file: .env` next to this compose file). Required names: `CURSOR_API_KEY`, `LINEAR_CLI_API_KEY`, `LINEAR_WEBHOOK_SECRET`, `GH_TOKEN`. Values live on `kit-harness`, not in git. Do not reuse `LINEAR_API_KEY` (bootstrap admin key).

## Models (not Anthropic)

Cursor does not ship a public OpenAI-compatible URL. The macOS app “API for Cursor” (`localhost:8787`) cannot run on this Linux box.

Use a Cursor SDK key + the Pi extension `pi-cursor-sdk`:

1. Mint a **user or service-account** key at [cursor.com/dashboard](https://cursor.com/dashboard) → Integrations / API Keys. Team Admin keys are rejected by the SDK.
2. Put it in `CURSOR_API_KEY` on this host (wizard or `/opt/kit-collective/harness/.env`).
3. Jobs: `pi --model cursor/composer-2.5` (implement) or `pi --model cursor/grok-4.6` (fast/planner). Defaults: `PI_MODEL` / `PI_MODEL_FAST`.
