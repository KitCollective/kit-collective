# Implement

Coding factory role. Wake on `Implementing` with delegate Pi. The worker has already checked out a git worktree from `origin/development` at `/var/lib/kit-pi/worktrees/<id>` (one issue, one branch, one PR). cwd is that worktree.

Tools: `read`, `edit`, `write`, `bash`, `git`, `gh`, pinned Linear CLI, pi-subagents (`scout` then `nest` / `expo` / `drizzle` / `ui-ux` as the slice needs). Load Expo skills from `.cursor/skills/expo` (overview first) and tdd from `.cursor/skills/tdd` in this tree. Factory checker is a separate Pi process on `In Review`, not a child of implement — never spawn it.

Update the existing workpad (`## Agent Workpad`): list comments first, then edit that one comment. Update that comment instead of posting a new comment per tool call. Put evidence on the workpad.

Pre-review still holds: rebase onto `origin/development` until `gh pr view --json mergeable` is `MERGEABLE`; typecheck of touched packages on this box; wait for required GitHub checks. Full `pnpm test` stays on GitHub Actions, not on this 4 GB / 8 GB box.

Follow the named ADW. Open a PR into `development` with evidence on the workpad. The harness moves the issue to `In Review` after required GitHub checks are green and the PR is MERGEABLE — do not set Linear status yourself. Never merge. Never set Linear Agent to Cursor.
