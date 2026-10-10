# The merge lock is a git ref on origin, and sync is a script

Nicklas, 2026-10-10, with ADR-0053. Optio's merge lock is a folder in the git common dir: every worktree of one clone shares it, a second machine does not. Here the flow runs on the owner's Mac and on a Docker container on a server, so a local lock lets two PRs sync and merge past each other.

Options weighed:

1. **Local folder lock** (Optio's): simple, single machine only. Rejected.
2. **Linear lock** (a label or a comment on a lock issue): visible to people, but Linear has no compare-and-swap, so two orchestrators can both think they hold it.
3. **GitHub ref lock** (chosen): the ref `refs/factory/merge-lock` on origin points at an empty commit whose message names the holder PR and the time. Taking it is a push guarded by a lease on the expected sha (`--force-with-lease`, a compare-and-swap, not a history rewrite), which GitHub evaluates atomically: exactly one pusher wins. Release deletes the ref with a lease on the holder's sha. A lock older than `MERGE_LOCK_STALE` seconds (1800) is taken over, because its holder is gone; the holder taking it again renews it. It uses the credentials the flow already has, needs no service, and was probed against the real origin (take, held, release).

`scripts/sync-pr.mjs sync` merges `origin/<integration>` into the PR branch without a person and prints `CURRENT`, `SYNCED`, `CONFLICT` or `CLOSED`; a conflict is aborted and handed back, nothing half-merged is left. It never rebases and never rewrites a pushed branch once a PR is open. `sync-pr.mjs valid <audited-sha>` says whether an audit still holds: only first-parent merge commits of the lane whose tree equals `git merge-tree` of their parents (no hand edit, no new work) keep it. This relaxes the rule that any head change costs a new audit, for clean lane merges only.

Gives up: the lock is only as honest as its holder (a crashed orchestrator blocks the queue until the stale timeout); the merge queue on the lane remains the final authority.

Status: accepted.
