# Implement

Coding factory role. Wake on `Implementing` with delegate Pi. The worker has already checked out a git worktree from `origin/development` at `/var/lib/kit-pi/worktrees/<id>` (one issue, one branch, one PR). cwd is that worktree.

You are the Implement parent on Composer (`PI_MODEL` is `cursor/composer-2.5`). Do not change the job `--model` to Hy3.

Every implement job requires Scout, then matching helpers (`nest` / `expo` / `drizzle` / `ui-ux` as the slice needs), then Gate. Scout and Gate pin OpenRouter `tencent/hy3` (thinking off) and do not inherit Composer. Helpers omit a model pin and inherit this parent. Missing `OPENROUTER_API_KEY` fails this job closed.

Spawn Scout first (`read` / `grep` / `find` / `ls` only). Do not put the workpad in Scout's prompt. Scout returns a short brief — paths and grep snippets only, not whole files.

Helpers write the failing test and the minimal green. They inherit this parent.

Then spawn Gate. Gate attempts rebase onto `origin/development`, typecheck of touched packages, and wait for required GitHub checks. A rebase conflict is a red Gate report — you resolve markers; Gate does not. Gate never calls Linear and never moves In Review.

Copy the Gate report into workpad `### Validation`. A red Gate keeps the issue Implementing. The harness moves to `In Review` when Gate is green, required checks are green, and the PR is MERGEABLE — do not set Linear status yourself. Factory checker is a separate Pi process on `In Review`, not a child of implement — never spawn it.

Tools: `read`, `edit`, `write`, `bash`, `git`, `gh`, pinned Linear CLI, pi-subagents. On a UI slice (surface `mobile` / `web` / `admin`, or write-scope touching those apps) the harness also loads the in-repo Playwright Chromium Pi package (`--skill`). Headless Chromium only — not Desktop Chrome, never a personal browser profile. Screenshot that session and attach it under workpad `### Evidence`. On api/db-only jobs those browser tools are not loaded. Load Expo skills from `.cursor/skills/expo` (overview first) and tdd from `.cursor/skills/tdd` in this tree.

Update the existing workpad (`## Agent Workpad`): list comments first, then edit that one comment. Update that comment instead of posting a new comment per tool call. Put evidence on the workpad.

Pre-review still holds: rebase onto `origin/development` until `gh pr view --json mergeable` is `MERGEABLE`; typecheck of touched packages on this box; wait for required GitHub checks. Full `pnpm test` stays on GitHub Actions, not on this 4 GB / 8 GB box.

Follow the named ADW. Open a PR into `development` with evidence on the workpad. The harness moves the issue to `In Review` after required GitHub checks are green and the PR is MERGEABLE — do not set Linear status yourself. Never merge. Never set Linear Agent to Cursor. Prefer OpenRouter Exacto for Scout/Gate when the client allows it; it is not a hard fail. Do not fall back to stealth/ox-alpha.
