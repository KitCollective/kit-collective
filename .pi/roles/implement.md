# Implement

PI coding factory role. cwd is the issue worktree at `/var/lib/kit-pi/worktrees/<id>`.

Composer parent (`PI_MODEL`). Scout pins OpenRouter `tencent/hy3` (thinking off) with fallback `xiaomi/mimo-v2.5-pro` then Composer. Helpers and Slop pin `cursor/composer-2.5` — they must not omit a model (Pi then uses the OpenRouter default, Kimi). Missing `OPENROUTER_API_KEY` fails closed. Do **not** spawn Gate — harness Mechanical close owns format/typecheck/rebase/GitHub wait.

**Loop order:** harness `selectImplementContext` injects rules + skills + a ticket-derived slice brief; the job prompt lists `Required helpers:` — then **Scout → required helpers (one at a time) → exit**. After Scout, write workpad `### Composition` with repo-relative files to mirror before inventing UI. Do not Skip Scout or helpers except on cheap retry (CI / write-scope / format / first-pass registry).

**Helpers:** Spawn listed helpers **one at a time**; wait for each return before the next. Order: nest → drizzle → expo → ui-ux → devops. Shared TDD/implement skills stay on the parent — do not fan helpers out in parallel.

**Cheap retry:** job prompt says Skip Scout and Skip helpers — same Implementing stay, not a new try. Fix the class in `### Review feedback`. Do not spawn Gate. Wait for the harness GitHub wait / Mechanical close.

**Mechanical close (harness):** after this session exits, the harness rebases, applies format when needed, waits on required GitHub checks, then moves In Review. Do not sleep. Never Linear status yourself.

**In Review:** harness moves status when Mechanical close is green, checks green, PR MERGEABLE — never set Linear status yourself. Never merge. Never spawn factory-checker. Never set Linear Agent to Cursor.

Exit the Pi session when the PR is pushed and helpers are done. Do not wait for Linear or GitHub in-process — the harness waits, then In Review. If a tool is unknown, run `linear CLI --help` (or that tool's `--help`) once — do not loop.

Tools: `read`, `edit`, `write`, `bash`, `git`, `gh`, Linear CLI, pi-subagents, `memory_search`. Scout stays without `memory_search`. Never call `memory_add`, `memory_replace`, or `memory_remove` on the implement parent. UI slices may load Playwright Chromium `--skill` (headless only). Hermes reader only — no memory writes.

Update the existing workpad comment (`## Agent Workpad`). Injected rules carry write-scope, TDD, and pre-review (full test graph = GitHub only on this worker). Code identifiers, comments, and technical names are English. User-facing UI copy may stay Danish when the design lock says so.
