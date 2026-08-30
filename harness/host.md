# PI worker host

Dedicated Agent-harness box. Not the product app host. Do not install the product PaaS panel here.

| Field | Value |
| --- | --- |
| Role | PI factory worker (webhook + up to four coding-pool slots + one Finisher slot) |
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
- Health: `https://harness.eskobar.dev/health` → `{"ok":true,"planner":"active","jobs":[{"role":"implement","identifier":"KIT-n"},…],"queued":["KIT-m",…],"job":{"role":"implement","identifier":"KIT-n"}|null,"capacity":{"ramFreeMb":…,"diskFreeMb":…,"ready":true|false},"tokens":{"role":"implement","identifier":"KIT-n","lines":[{"role":"implement","model":"Composer","input":…,"output":…}]}|null}` HTTP 200 while the process is up. **`jobs`** lists every running occupant (coding pool + Finisher). **`queued`** lists KIT identifiers waiting for a free slot. Singular **`job`** is derived (first occupant or `null`) for older readers — not the occupancy source of truth. **`tokens`** is the last implement / factory-checker totals per role and model (input/output, or `unknown`) after that job exits, else `null`. Capacity is free RAM and worktree-volume disk against env floors. Never 503 because a job is running, hung, or waiting on the Capacity gate. Never API keys in this JSON.
- **Coding pool:** up to `PI_IMPLEMENT_SLOTS` concurrent **implement** and **factory-checker** jobs (default **4**, clamp **1–4**). They share the same slots — review is not serialized behind a single Finisher. Each job checks out its own Issue worktree under `/var/lib/kit-pi/worktrees/KIT-n`. A fifth coding job waits in **`queued`** without preempting live Composers.
- **Finisher slot:** one reserved slot for **auto-merge** and **land** only (no Pi). Finisher jobs may start while the coding pool is full — they jump a queued implement or checker without killing a live Composer. Factory-checker never occupies Finisher. Finisher is never stolen for a fifth coding-pool job.
- Webhook cgroup **mem_limit 5g** (not 768m). Each Pi child is ~470 MB RSS; 768m OOM-kills factory-checker when an implement is already live (`pi exited null`). The CX33 has 8 GB; Caddy and the host keep the rest.
- Capacity gate: before a coding-job spawn, free RAM and the `kit_pi` worktree volume must clear env floors (defaults 2048 MB RAM / 5120 MB disk). Names: `PI_CAPACITY_RAM_MB`, `PI_CAPACITY_DISK_MB`. When `ready` is false the job stays queued, status is unchanged (not Timeout park), and the worker writes one Linear comment (`## Capacity gate`) updated in place. Planner still runs. Chromium for implement UI evidence counts extra (`CHROMIUM_RAM_MB`, 512 MB on top of the RAM floor). If that Chromium floor is not ready, the job may still spawn Pi but browser tools are omitted and Chromium spawn is refused. Headless Chromium only — never Nicklas’s Desktop Chrome or a personal browser profile. The worker image installs the Playwright Chromium headless-shell binary at build (`npx playwright install --with-deps --only-shell chromium`); that is not Desktop Chrome. Image boot still only `pi install`s the four global packages — it does not load the implement-browser Pi package. The Playwright Chromium Pi package is loaded via `--skill` on UI implement only; it is not in `.pi/settings.json`, so planner, Intake, factory-checker, and api/db-only implement do not load those tools. GitHub Actions still never opens Chromium.
- TLS: Let’s Encrypt via Caddy

## Observability (optional)

Prometheus + Grafana + Loki overlay on the same CX33. **Metrics:** host (`node_exporter`) and harness state from the webhook service `GET /health` (compose network) via `json_exporter` (15s). **Logs:** structured JSON lines from the webhook container (`harness-log.mjs` on stderr) → Promtail → Loki. Pi stdout still lands in Docker logs but is unstructured; use structured `event` + `gate` lines for alerting.

### Agent log flow

| Source | Where it goes | Structured? |
| --- | --- | --- |
| Job slot lifecycle (`start`, `exit`, `fail`, `retry`, `wait`) | `harness/job-queue.mjs` → stderr JSON | yes — `role`, `identifier`, `event`, `gate`, `loopRisk` |
| Pi idle timeout / non-implement Pi exit | `harness/pi-job.mjs` → stderr JSON | yes — `event=fail`, `gate=red` |
| Implement CI / write-scope / format retry | `harness/job-queue.mjs` → stderr JSON | yes — `event=retry`, `gate=yellow`, `reason`, `attempt` |
| Capacity gate (spawn blocked) | `harness/capacity.mjs`, `harness/job-queue.mjs` | yes — `event=wait`, `gate=yellow`, `reason=capacity` |
| Pi stdout (Composer/Grok JSONL) | Docker json-file log for `webhook` | no — tail via Loki without `source=harness` filter |
| Planner / resume / intake pollers | legacy `[role] …` on stderr | no |
| Job queue throw after cap | structured `event=fail`, `gate=red` | yes |

**Gate semantics** (factory ship-ready / merge-with-follow-up / do-not-merge):

| Gate | Meaning | Typical events |
| --- | --- | --- |
| `green` | Ship-ready — on track | `start`, clean `exit` (In Review, checker pass) |
| `yellow` | Loop debt / waiting — monitor | `retry` (CI, format, write-scope under cap), `wait` (capacity), `exit` still Implementing |
| `red` | Do not merge / stuck | `fail` (idle timeout, retry cap, Pi exit, queue throw), checker-fail `exit` |

Promtail keeps only the `webhook` compose service, parses JSON lines with `source=harness`, and labels `role`, `kit` (KIT identifier), `event`, `gate`, `phase`.

**Session progress (Pi stdout):** while implement or factory-checker runs, `pi-session-log.mjs` emits structured `phase`, `tool`, and `tokens` events for Grafana (Scout/Gate/helpers, bash/read, `memory_search` / `session_search` query, `memory_add|replace|remove` target only — never lesson bodies, live token snapshots every **15s**). The same Pi JSON is mapped to a display-only Linear Agent Session (`thought` / `action` / `response`) when `LINEAR_PI_ACCESS_TOKEN` is set — human verb phrases, never raw CLI. Inbound session webhooks stay unused. Stop-points 1–10: session=1, scout=2, helper=3, gate=4, implement=6, checker=8. Full JSON stays in Grafana log details (click row). Grafana dashboard auto-refresh defaults to **5s**; the stat **Session events (last 1m)** is a rolling count — not the poll interval.

| Item | Value |
| --- | --- |
| Compose overlay | `harness/docker-compose.monitoring.yml` |
| Up command | `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d` |
| Grafana URL | `https://grafana.eskobar.dev` (DNS A → `62.238.125.114`, same as harness) |
| Default login | `admin` + `GRAFANA_ADMIN_PASSWORD` from box `.env` |
| Dashboards | **Harness → Kit harness overview** (metrics), **Kit harness agent logs** (Loki) |
| RAM budget | ~1 GB cgroup caps (Prometheus 384m + Grafana 256m + Loki 256m + Promtail 128m) + ~50 MB exporters |

**Enable on kit-harness**

1. `ssh kit-harness` → `cd /opt/kit-collective/harness` → `git pull`.
2. Rebuild webhook so structured logs ship: `docker compose build webhook && docker compose up -d webhook`.
3. Add to `.env` (never git): `GRAFANA_ADMIN_PASSWORD=<strong>`; optional `GRAFANA_ROOT_URL=https://grafana.eskobar.dev/`.
4. Cloudflare/DNS: `grafana.eskobar.dev` A record → `62.238.125.114`.
5. `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d`.
6. `curl -sS https://grafana.eskobar.dev/api/health` → `{"database":"ok",…}`.
7. Open **Kit harness agent logs** — run a test job and confirm `event=start` / `event=exit` lines.
8. Import extras (optional): Grafana.com **1860** (Node Exporter Full) against Prometheus.

**Example LogQL**

```logql
# Failures for one issue
{compose_service="webhook", kit="KIT-113", event="fail"} | json

# Red gate rate (5m)
sum(rate({compose_service="webhook", gate="red"}[5m]))

# Yellow warnings — retries + capacity waits (1h)
sum(count_over_time({compose_service="webhook", gate="yellow"}[1h]))

# Gate distribution (1h)
sum by (gate) (count_over_time({compose_service="webhook", source="harness"} | json | gate != "" [1h]))

# Potentially stuck: started but no exit/fail in 45m
sum by (kit) (
  count_over_time({compose_service="webhook", event="start"}[45m])
)
unless
sum by (kit) (
  count_over_time({compose_service="webhook", event=~"exit|fail"}[45m])
)

# Implement error rate (5m)
sum(rate({compose_service="webhook", role="implement", event="fail"}[5m]))

# Recent structured tail (all roles)
{compose_service="webhook"} | json | source="harness"

# Readable one-liner (Grafana log panels — click row for full JSON accordion)
{compose_service="webhook"} | json | source="harness" | line_format "{{.identifier}} · {{.role}} · {{.event}} · gate={{.gate}} · risk={{.loopRisk}}{{ if .attempt }} · try={{.attempt}}{{ end }}{{ if .reason }} · {{.reason}}{{ end }}{{ if .error }} · {{.error}}{{ end }}"

# Raw Pi stdout noise (unstructured docker wrapper)
{compose_service="webhook"} != `source":"harness"`
```

**Disable:** `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml down` (volumes keep history; add `-v` to wipe).

Caddy serves `grafana.eskobar.dev` only when the overlay is up; otherwise that hostname 502s — harness webhook is unaffected.
- Worker `.env` on the box only — never git. Path: `/opt/kit-collective/harness/.env` (compose `env_file: .env` next to this compose file). Required names: `CURSOR_API_KEY`, `LINEAR_CLI_API_KEY`, `LINEAR_WEBHOOK_SECRET`, `GH_TOKEN`, `OPENROUTER_API_KEY`. Issue status webhooks use `LINEAR_WEBHOOK_SECRET`. Inbound AgentSession HMAC is unused (KIT-113). Outbound Agent Session timeline uses `LINEAR_PI_ACCESS_TOKEN` (actor=app) when set — not required for boot. Never use `LINEAR_CLI_API_KEY` or `LINEAR_API_KEY` for activity mutations. Values live on `kit-harness`, not in git. Do not reuse `LINEAR_API_KEY` (bootstrap admin key). `OPENROUTER_API_KEY` is for Scout (`tencent/hy3`) and Gate (`xiaomi/mimo-v2.5-pro`); missing it fails implement closed. The value stays on kit-harness.
- Implement worktrees: bare mirror `/var/lib/kit-pi/mirror.git`, issue trees `/var/lib/kit-pi/worktrees/KIT-n`. Checkout sits on the open `development` PR head for that identifier, else `origin/kit-n`. Implement may create `kit-n` from `origin/development` only when neither exists. A leftover rebase is aborted; implement with an open PR force-resets onto that head. implement-exit rebases only when the open PR is not already `MERGEABLE`; a MERGEABLE PR is reset onto `origin/<branch>` before write-scope so the diff matches the PR. A conflicted rebase is aborted instead of leaving the tree wedged. Implement-exit still runs after a non-zero Pi so a green MERGEABLE PR can move In Review. Gate runs `pnpm format:check` (or image-global `biome ci .`) as a red report — not typecheck (yellow). Out-of-glob write-scope keeps Implementing and **re-runs implement in the same slot** (same cap as CI retry) so the issue is not dropped behind a resume overlap skip. implement-exit evaluates write-scope with the image allowlist as the floor; the worktree `scripts/lib/pr-write-scope.mjs` may waive only new `scripts/check-*.mjs` / matching tests. A colliding Drizzle `NNNN_` prefix vs `origin/development` cheap-retries (`migrationRetry`) before rebase wait. `.cursor/hooks/block-pi-ci-sleep.sh` denies `sleep` ≥ 10s and `gh pr checks` poll/`--watch` — the harness waits. CI, write-scope, and format retries **Skip Scout** and skip helpers: prompt is workpad `### Review feedback` plus the redacted CI excerpt (fix the class — format vs Zod vs unique-email). After the in-slot **implement retry cap**, the worker holds Implementing with a Linear comment (`Linear Agent left empty`; no Cursor Cloud Agent); resume does not enqueue a new Composer. Checker reuse throws instead of reviewing the lane. Two open issue PRs fail closed. One issue, one open PR. Checker pass updates the existing workpad with an all-good status line and token use; fail writes `### Review feedback`. Compose volume `kit_pi`.
- **Worker memory:** Hermes store at `/var/lib/kit-pi/hermes` on the same `kit_pi` volume — outside Issue worktrees, survives Worktree reap and image rebuild. **factory-checker is the Memory writer:** may search and write (`memory_add`, `memory_replace`, `memory_remove`) with background review, correction detection, and shutdown flush (`PI_CODING_AGENT_DIR` → `.pi/agent-checker` on checker spawn). **Memory readers** (implement, Scout, Gate, helpers) search only; memory-write tools and `skill_manage` stay excluded from implement spawn. Injection is Memory policy-only (no MEMORY.md dump). Reader config lives at `PI_CODING_AGENT_DIR=/workspace/.pi/agent`; `KIT_PI_HERMES=/var/lib/kit-pi/hermes`. Git ratchets still win over Hermes.
- Idle timeout: `PI_JOB_IDLE_MS` (default 45 minutes). A spawned Pi child with no close and no stdout is killed as a process group; **only that job's slot** is freed (Implement or Finisher). The worker writes Parked (Timeout park) and reaps that Issue worktree; the bare mirror stays. A sibling implement in another slot is not killed. A human Park keeps the Issue worktree. Land merge success to Done and a status change to Canceled also reap. After Pi emits `agent_end`, the worker waits `PI_AGENT_END_GRACE_MS` (default 8 seconds) then kills the process group if the child has not closed. That is not Idle timeout and does not Park — implement-exit still runs.

## Planner (Linear-only)

When this worker’s planner job is **Active** (health `planner: "active"`, 5-minute Linear CLI poller plus webhook `role=planner`), the Cursor Automations planner cron in `docs/agents/automations.md` must stay **Inactive** (paused or removed). Two planners must not claim the same issue. The PI wrapper talks only to the pinned Linear CLI: no file tools, no general bash, no Pi spawn. Planner moves to Implementing without setting Linear Agent; never Cursor.

Resume is a Linear CLI job on its own mutex (`startResumePoller`, same interval as the planner poller). It must not wait behind a hung planner or Intake. On listen it lists Implementing / In Review / Ready for merge / Merging and enqueues the matching factory role when the coding slot does not already hold that identifier. Implement enqueues when Linear Agent is empty. Checkout reuses the Issue worktree. Parked and Implementing with Cursor Agent are skipped. Implementing after **implement retry cap** is skipped (no new Composer) — **except land merge-fail** (`reviewFeedbackIsLandFail` on the workpad): resume bypasses the cap and re-enqueues implement so a freed slot can retry rebase/MERGEABLE without a new feature loop. When an implement job completes without a Linear status change, the identifier drops out of `queued`; the next resume tick may enqueue the same issue again (including merge-fail while still Implementing). Write-scope overlap among Implementing issues enqueues only the first in Linear priority order; overlap-skip is intentional — a blocked issue waits for the overlapping implement to finish or for a human to adjust scope. It does not claim, move status, or set delegate.

Intake is a separate hourly Linear CLI job (`PI_INTAKE_POLL_MS`, default 1 hour) on the same planner mutex. It lists open KIT Triage, promotes well-formed slices, and shapes leftovers that have an inferable write-scope (Type, What to build, AC, `write-scope:`) onto the same issue — one finding stays one ticket. Unshaped Sentry or leftovers with no path stay in Triage with one comment. It does not spawn Pi, does not occupy the coding slot, never sets Implementing / In Review / Merging / Done, never sets delegate, and never sets Linear Agent to Cursor.

## Models (not Anthropic)

Cursor does not ship a public OpenAI-compatible URL. The macOS app “API for Cursor” (`localhost:8787`) cannot run on this Linux box.

Use a Cursor SDK key + the Pi extension `pi-cursor-sdk`:

1. Mint a **user or service-account** key at [cursor.com/dashboard](https://cursor.com/dashboard) → Integrations / API Keys. Team Admin keys are rejected by the SDK.
2. Put it in `CURSOR_API_KEY` on this host (wizard or `/opt/kit-collective/harness/.env`).
3. Jobs: `pi --model cursor/composer-2.5` (implement parent) or `pi --model cursor/grok-4.6` (factory-checker / land). Planner is the Linear CLI wrapper, not a Pi session. Defaults: `PI_MODEL` / `PI_MODEL_FAST`. Implement Scout pins OpenRouter `tencent/hy3` (no-think) with fallback `xiaomi/mimo-v2.5-pro` then Composer. Gate pins `xiaomi/mimo-v2.5-pro` with fallback `tencent/hy3` then Composer — not Kimi, not Hy4. Helpers and Slop pin `cursor/composer-2.5` (Pi does not inherit the parent `--model` when the agent omits `model:`). Put `OPENROUTER_API_KEY` in this host `.env` (wizard or `/opt/kit-collective/harness/.env`).

## PI implement context (single source)

Edit factory rules and skills under `.cursor/rules/*.mdc` and `.cursor/skills/*` on Desktop — not `.pi/generated/implement-context.md` by hand. Regenerate with `node scripts/generate-pi-implement-context.mjs` (also runs from `scripts/generate-harness-docs.mjs`). CI `check-pi-implement-context-generated` fails when the committed `.pi/generated/implement-context.md` or `.pi/agents/{nest,expo,drizzle,ui-ux,devops}.md` wrappers drift from those sources. The harness appends the generated base plus dynamic rules (e.g. `design-system.mdc` on UI slices) at runtime to `.pi/generated/implement-append.md` (gitignored).
