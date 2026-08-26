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
- Health: `https://harness.eskobar.dev/health` → `{"ok":true,"planner":"active","job":{"role":"implement","identifier":"KIT-n"}|null,"capacity":{"ramFreeMb":…,"diskFreeMb":…,"ready":true|false}}` HTTP 200 while the process is up. `job` is the Coding job occupying the slot (implement / factory-checker / land) or `null`. Capacity is free RAM and worktree-volume disk against env floors. Never 503 because a job is running, hung, or waiting on the Capacity gate.
- Capacity gate: before a coding-job spawn, free RAM and the `kit_pi` worktree volume must clear env floors (defaults 2048 MB RAM / 5120 MB disk). Names: `PI_CAPACITY_RAM_MB`, `PI_CAPACITY_DISK_MB`. When `ready` is false the job stays queued, status is unchanged (not Timeout park), and the worker writes one Linear comment (`## Capacity gate`) updated in place. Planner still runs.
- TLS: Let’s Encrypt via Caddy
- Worker `.env` on the box only — never git. Path: `/opt/kit-collective/harness/.env` (compose `env_file: .env` next to this compose file). Required names: `CURSOR_API_KEY`, `LINEAR_CLI_API_KEY`, `LINEAR_WEBHOOK_SECRET`, `GH_TOKEN`, `LINEAR_PI_APP_USER_ID`, `OPENROUTER_API_KEY`. AgentSession HMAC is `LINEAR_PI_WEBHOOK_SECRET` (KIT-59 display/ack; not a boot-fail if unset — session path returns 401). Agent activity mutations use cached actor=app `LINEAR_PI_ACCESS_TOKEN` (not a personal `lin_api_` key); mint again with `LINEAR_PI_CLIENT_ID` / `LINEAR_PI_CLIENT_SECRET` via `client_credentials` after HTTP 401 (~30-day expiry). Values live on `kit-harness`, not in git. Do not reuse `LINEAR_API_KEY` (bootstrap admin key). `LINEAR_PI_APP_USER_ID` is the Pi app user UUID (KIT-58), not a token. `OPENROUTER_API_KEY` is for Scout and Gate (`tencent/hy3`); missing it fails implement closed. The value stays on kit-harness.
- Implement worktrees: bare mirror `/var/lib/kit-pi/mirror.git`, issue trees `/var/lib/kit-pi/worktrees/KIT-n`. Implement creates `kit-n` from `origin/development`. Factory-checker reuses that tree (or `origin/kit-n` once the PR exists). One issue, one branch, one PR. Compose volume `kit_pi`.
- Idle timeout: `PI_JOB_IDLE_MS` (default 45 minutes). A spawned Pi child with no close and no stdout is killed as a process group; the coding slot is freed. The worker writes Parked (Timeout park) and reaps the Issue worktree; the bare mirror stays. A human Park keeps the Issue worktree. Land merge success to Done and a status change to Canceled also reap.

## Planner (Linear-only)

When this worker’s planner job is **Active** (health `planner: "active"`, 5-minute Linear CLI poller plus webhook `role=planner`), the Cursor Automations planner cron in `docs/agents/automations.md` must stay **Inactive** (paused or removed). Two planners must not claim the same issue. The PI wrapper talks only to the pinned Linear CLI: no file tools, no general bash, no Pi spawn. Delegate on claim is the Pi app user; never Cursor.

Intake is a separate hourly Linear CLI job (`PI_INTAKE_POLL_MS`, default 1 hour) on the same planner mutex. It lists open KIT Triage, promotes well-formed slices, consolidates leftovers, and comments unshaped Sentry. It does not spawn Pi, does not occupy the coding slot, never sets Implementing / In Review / Merging / Done, and never sets Linear Agent to Cursor.

## Models (not Anthropic)

Cursor does not ship a public OpenAI-compatible URL. The macOS app “API for Cursor” (`localhost:8787`) cannot run on this Linux box.

Use a Cursor SDK key + the Pi extension `pi-cursor-sdk`:

1. Mint a **user or service-account** key at [cursor.com/dashboard](https://cursor.com/dashboard) → Integrations / API Keys. Team Admin keys are rejected by the SDK.
2. Put it in `CURSOR_API_KEY` on this host (wizard or `/opt/kit-collective/harness/.env`).
3. Jobs: `pi --model cursor/composer-2.5` (implement parent) or `pi --model cursor/grok-4.6` (factory-checker / land). Planner is the Linear CLI wrapper, not a Pi session. Defaults: `PI_MODEL` / `PI_MODEL_FAST`. Implement Scout and Gate pin OpenRouter `tencent/hy3` (no-think) via `.pi/agents` frontmatter; they do not inherit Composer. Helpers omit a model pin. Put `OPENROUTER_API_KEY` in this host `.env` (wizard or `/opt/kit-collective/harness/.env`).
