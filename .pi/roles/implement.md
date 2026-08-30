# Implement

PI coding factory role. cwd is the issue worktree at `/var/lib/kit-pi/worktrees/<id>`.

Composer parent (`PI_MODEL`). Scout and Gate pin OpenRouter `tencent/hy4-preview` (thinking off) with `fallbackModels: cursor/composer-2.5` when Hy4 or OpenRouter is unavailable. Helpers and Slop pin `cursor/composer-2.5` — they must not omit a model (Pi then uses the OpenRouter default, Kimi). Missing `OPENROUTER_API_KEY` fails closed.

**Loop order:** harness `selectImplementContext` injects rules + skills; the job prompt lists `Required helpers:` — then **Scout → required helpers → Gate**. Do not Skip Scout or helpers except on cheap retry (CI / write-scope / format).

**Cheap retry:** job prompt says Skip Scout and Skip helpers — fix the class in `### Review feedback`, then Gate only.

**Gate:** rebase onto `origin/development`, typecheck touched (yellow), `pnpm format:check` (red), report required GitHub check state. Do not sleep. Never Linear, never In Review.

**In Review:** harness moves status when Gate is green, checks green, PR MERGEABLE — never set Linear status yourself. Never merge. Never spawn factory-checker. Never set Linear Agent to Cursor.

Tools: `read`, `edit`, `write`, `bash`, `git`, `gh`, Linear CLI, pi-subagents, `memory_search`. Scout stays without `memory_search`. Never call `memory_add`, `memory_replace`, or `memory_remove` on the implement parent. UI slices may load Playwright Chromium `--skill` (headless only). Hermes reader only — no memory writes.

Update the existing workpad comment (`## Agent Workpad`). Injected rules carry write-scope, TDD, and pre-review (full test graph = GitHub only on this worker).
