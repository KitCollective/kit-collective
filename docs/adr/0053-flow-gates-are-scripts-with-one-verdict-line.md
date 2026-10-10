# Flow gates are scripts with one verdict line

Nicklas, 2026-10-10, with ADR-0051 and ADR-0052. The issue flow will run as several bb threads on several machines, so a gate cannot rest on the orchestrator's memory or on one machine's worktrees. Optio's gates (`head-changed`, `session-check`, the land gate, `gate review`) are the model; we take the logic, not the shell scripts.

1. **`head-changed`** (`scripts/head-changed.mjs`): a head already audited red is never audited again. Red comes from the run log's last audit and from the workpad's `lastReviewSha` with open `### Review feedback`. Unreadable head: closed.
2. **`session-check`** (`scripts/session-check.mjs`): refuses a second run on an issue from Linear state and labels, GitHub open PRs and remote branches named for the issue, and the run log (a start in the last 30 minutes with no result). No local worktrees. `--resume` is the deliberate join.
3. **Land gate** (`gate.mjs land`): `Done` only when the PR is merged, its merge commit is an ancestor of `origin/<integration>`, and every check run on that merge commit is green (`requiredChecksGreen` of `land-policy`). Merge-queue lag is exit 3 (wait), not a failure.
4. **No result line, run the gate** (`gate.mjs result`): a step that ends without its `TAG KIT-n outcome` line is never read as a pass; the orchestrator runs the gate itself and goes by its exit code (Optio OPT-389).
5. **One review entry** (`gate.mjs review`): `check-code-english`, `check-doc-references`, matrix validation, write-scope and `wait-for-checks` in one call, one verdict line (the first failing step plus a count), logged as a `gate` event.

Exit codes everywhere: `0` open, `1` closed, `2` usage, `3` waiting, `4` unknown. Each gate logs `gate` events (ADR-0052).

Gives up: the gates read GitHub and Linear on every call (rate and latency), and the session check is advisory between two orchestrators started in the same second.

Status: accepted.
