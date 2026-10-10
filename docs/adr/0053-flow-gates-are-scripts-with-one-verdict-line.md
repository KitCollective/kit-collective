# Flow gates are scripts with one verdict line

Nicklas, 2026-10-10, with ADR-0051 and ADR-0052. The issue flow will run as several bb threads on several machines, so a gate cannot rest on the orchestrator's memory or on one machine's worktrees. Optio's gates (`head-changed`, `session-check`, the land gate, `gate review`) are the model; we take the logic, not the shell scripts.

1. **`head-changed`** (`scripts/head-changed.mjs`): a head already audited red is never audited again. Red comes from the run log's last audit and from the workpad's `lastReviewSha` with open `### Review feedback`. Unreadable head: closed.
2. **`session-check`** (`scripts/session-check.mjs`): refuses a second run on an issue from Linear state and labels, GitHub open PRs and remote branches named for the issue, and the run log (a start in the last 30 minutes with no result). No local worktrees. `--resume` is the deliberate join.
3. **Land gate** (`gate.mjs land`): `Done` only when the PR is merged, its merge commit is an ancestor of `origin/<integration>`, and every check run on that merge commit is green (`requiredChecksGreen` of `land-policy`). Merge-queue lag is exit 3 (wait), not a failure.
4. **No result line, run the gate** (`gate.mjs result`): a step that ends without its `TAG KIT-n outcome` line is never read as a pass; the orchestrator runs the gate itself and goes by its exit code (Optio OPT-389).
5. **One review entry** (`gate.mjs review`): `check-code-english`, `check-doc-references`, matrix validation, write-scope and `wait-for-checks` in one call, one verdict line (the first failing step plus a count), logged as a `gate` event.

**File lists are read exactly.** Every script that decides from "which files changed" or "what is in the tree" reads through `scripts/lib/git-files.mjs`: `git diff --name-only -z --no-renames` and `git ls-tree -r -z`, split on NUL (a renamed file counts at both paths; a non-ASCII name, a name with spaces or a newline is never quoted or escaped), every ref or range checked before it reaches git (nothing that starts with `-`) and passed after `--end-of-options`, so `--output=...` or `--upload-pack=...` can neither write a file nor read as an empty list; a bad ref is a refusal (exit 2). Names that are not valid UTF-8 are matched by their lossy UTF-8 form, hashed from their raw bytes, and never passed back to git. `matchesGlob` also lets `**` span a newline in a name.

Inventory of every place the repo reads a file list from git (scripts, skills, hooks, workflows):

- Converted: suite selection and the reuse key (`verify.mjs`: diff and `ls-tree -z`), dirty paths (`status --porcelain -z --untracked-files=all`), review rows (`review-matrix.mjs plan`), the write-scope ratchet (`check-pr-write-scope.mjs`, `changedFilesDiffArgs`), the Danish-name check (`check-code-english.mjs`), the doc-reference path list (`ls-files -z`), the sync conflict list (`diff --diff-filter=U -z`). `.githooks/pre-commit` already used `-z`.
- Left alone, with the reason: `git status --porcelain | grep -q .` in `finish-reap-hygiene.sh`, `reap-desktop-hygiene.sh`, `sync-development.sh` and `sync-pr.mjs` only tests whether anything is dirty, never reads a name. `check-migration-prefixes.mjs` and `.cursor/hooks/block-migration-prefix-collision.sh` list `packages/db/migrations`, whose names are ASCII by rule; a quoted odd name matches no migration pattern, so it cannot hide a collision. `classify-fix-diff.mjs` and the doc-reference diff read diff text hunks, not file lists. The CI `api` job filter in `.github/workflows/ci.yml` (`git diff --name-only | grep -Ev`) is left on purpose: a quoted name fails to match the exclusions, so the job runs, which is the safe direction, and changing the required-check filter is not worth the risk.

Exit codes everywhere: `0` open, `1` closed, `2` usage, `3` waiting, `4` unknown. Each gate logs `gate` events (ADR-0052).

Known limit: the claim race. Two orchestrators started together can both get OPEN from `session-check` and both claim the issue, because Linear has no atomic claim. The run-log check narrows the window; it does not remove it. `gate.mjs review` also refuses to run unless the checkout is the PR's head, since its diff-based steps read the checkout.

Gives up: the gates read GitHub and Linear on every call (rate and latency), and the session check is advisory between two orchestrators started in the same second.

Status: accepted.
