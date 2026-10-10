# Flow gates are scripts with one verdict line

Nicklas, 2026-10-10, with ADR-0051 and ADR-0052. The issue flow will run as several bb threads on several machines, so a gate cannot rest on the orchestrator's memory or on one machine's worktrees. Optio's gates (`head-changed`, `session-check`, the land gate, `gate review`) are the model; we take the logic, not the shell scripts.

1. **`head-changed`** (`scripts/head-changed.mjs`): a head already audited red is never audited again. Red comes from the run log's last audit and from the workpad's `lastReviewSha` with open `### Review feedback`. Unreadable head: closed.
2. **`session-check`** (`scripts/session-check.mjs`): refuses a second run on an issue from Linear state and labels, GitHub open PRs and remote branches named for the issue, and the run log (a start in the last 30 minutes with no result). No local worktrees. `--resume` is the deliberate join.
3. **Land gate** (`gate.mjs land`): `Done` only when the PR is merged, its merge commit is an ancestor of `origin/<integration>`, and every check run on that merge commit is green (`requiredChecksGreen` of `land-policy`). Merge-queue lag is exit 3 (wait), not a failure.
4. **No result line, run the gate** (`gate.mjs result`): a step that ends without its `TAG KIT-n outcome` line is never read as a pass; the orchestrator runs the gate itself and goes by its exit code (Optio OPT-389).
5. **One review entry** (`gate.mjs review`): `check-code-english`, `check-doc-references`, matrix validation, write-scope and `wait-for-checks` in one call, one verdict line (the first failing step plus a count), logged as a `gate` event.

**File lists are read exactly, where this change reaches.** `scripts/lib/git-files.mjs` is the one reader: `git diff --name-only -z --no-renames` and `git ls-tree -r -z`, split on NUL (a renamed file counts at both paths; a non-ASCII name, a name with spaces or a newline is never quoted or escaped), and every ref or range checked by `assertRef` and passed after `--end-of-options`. `matchesGlob` also lets `**` span a newline in a name. Names that are not valid UTF-8 are matched by their lossy UTF-8 form, hashed from their raw bytes, and never passed back to git.

Converted (file lists read through the helper): `verify.mjs` (suite selection, the `ls-tree -z` reuse key, `status --porcelain -z` dirty paths), `review-matrix.mjs plan`, `check-pr-write-scope.mjs` (through `changedFilesDiffArgs`), `check-code-english.mjs` (added names), `check-doc-references.mjs` (`ls-files -z`), and the conflict list in `sync-pr.mjs`. `.githooks/pre-commit` already used `-z`.

Refs validated with `assertRef` and `--end-of-options`: every script above that takes a ref, sha or `BASE_REF` from the command line, the environment or a workpad (`verify --changed`, `review-matrix plan`, `sync-pr valid`, `check-pr-write-scope`, `check-code-english`, `check-doc-references`, `classify-fix-diff`). An invalid one is a refusal with exit 2, never "nothing to compare" or a pass. The validator is strict on purpose and also refuses valid but unusual refs (`HEAD@{1}`, `HEAD^{tree}`, branch names with `+` or non-ASCII characters): pass a sha instead.

**Not converted yet** (a follow-up, each for a reason):
- `scripts/check-migration-prefixes.mjs` reads `ls-tree -r --name-only` and `diff --name-only` without `-z`. A non-ASCII migration name arrives quoted, fails the migration name pattern and is dropped, so `9999_æble.sql` against a base `9999_base.sql` is not reported while the ASCII equivalent is. This is a real gap, not a safe direction; `.cursor/hooks/block-migration-prefix-collision.sh` has the same shape.
- `apps/mobile/.maestro/source-stamp.sh` and `native-cache.sh` hash `ls-tree -r HEAD` as a stamp and filter `status --porcelain`; quoting does not break them because the blob sha stays in each line.
- `scripts/e2e/review-run.mjs` (the `E2E_SHA` to merge-base step) takes its sha from the environment unvalidated.
- The `HEAD~1` fallback in `check-pr-write-scope.mjs` (no ref input; it runs when the base ref cannot be read).
- The CI `api` job filter in `.github/workflows/ci.yml` (`git diff --name-only | grep -Ev`): a quoted name fails to match the exclusions, so the job runs, which is the safe direction; changing the required-check filter is not worth the risk.
- `git status --porcelain | grep -q .` in `finish-reap-hygiene.sh`, `reap-desktop-hygiene.sh`, `sync-development.sh` and `sync-pr.mjs` only tests whether anything is dirty and never reads a name.
- `classify-fix-diff.mjs` and the doc-reference diff read diff text hunks, not file lists (their refs are validated, see above).

Exit codes everywhere: `0` open, `1` closed, `2` usage, `3` waiting, `4` unknown. Each gate logs `gate` events (ADR-0052).

Known limit: the claim race. Two orchestrators started together can both get OPEN from `session-check` and both claim the issue, because Linear has no atomic claim. The run-log check narrows the window; it does not remove it. `gate.mjs review` also refuses to run unless the checkout is the PR's head, since its diff-based steps read the checkout.

Gives up: the gates read GitHub and Linear on every call (rate and latency), and the session check is advisory between two orchestrators started in the same second.

Status: accepted.
