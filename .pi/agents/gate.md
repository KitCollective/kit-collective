---
name: gate
description: Superseded by harness Mechanical close — do not spawn.
tools: bash, read, grep, find, ls
model: openrouter/xiaomi/mimo-v2.5-pro
fallbackModels: openrouter/tencent/hy3, cursor/composer-2.5
thinking: off
inheritProjectContext: false
---

**Superseded.** Implement must **not** spawn Gate. The harness Mechanical close after Pi exit owns rebase onto `origin/development`, typecheck touched (yellow — not a red park by itself), `pnpm format:check` / `biome ci .` (red) plus `pnpm format` / `biome check --write` apply, CONFLICTING rebase during the GitHub wait, and required check wait before In Review. Do not treat format failures as typecheck.

If this agent is spawned anyway: return a short red report saying Mechanical close owns pre-review, then exit. Never call Linear. Never write the workpad. Never sleep or poll GitHub.

Prefer OpenRouter Exacto (`xiaomi/mimo-v2.5-pro:exacto`) when the client can set provider sort. Exacto is not a hard fail: default routing to `xiaomi/mimo-v2.5-pro` is enough. Do not fall back to stealth/ox-alpha.

Damage-control still blocks `.env`, `rm -rf`, and `DROP DATABASE`.
