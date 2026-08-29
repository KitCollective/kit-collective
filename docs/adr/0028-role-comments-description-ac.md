# Role comments and description AC on checker pass

Supersedes the Pi-delegate ownership parts of ADR-0025. Cursor skip on dispatch stays.

Each factory role writes one new top-level Linear issue comment at its status transition: planner claim, implement → In Review, checker pass/fail, Auto-merge flip/refuse, land success/fail. The workpad stays exactly one `## Agent Workpad` comment edited in place.

Checker pass writes one comment with a verdict per Acceptance criterion and ticks those criteria `[x]` in the issue description. If a criterion changed, checker rewrites that description line and comments why — never silently ticks unmet or stale text.

Auto-merge flips Ready for merge → Merging when the PR is MERGEABLE, required checks are green, and loop counters are under the cap. Pi delegate is not a gate. Empty Linear Agent is the happy path.

Status: accepted

Supersedes: ADR-0025 (Pi-delegate ownership for Auto-merge only; Cursor skip unchanged)
