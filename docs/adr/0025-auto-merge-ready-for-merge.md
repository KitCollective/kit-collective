# Auto-merge may set Merging under a loop cap

**Superseded (Pi-delegate ownership):** ADR-0028 — Auto-merge no longer keys on Pi delegate; empty Linear Agent is the happy path. Cursor skip on dispatch is unchanged.

Ready for merge used to wait for Nicklas. The worker may move Ready for merge → Merging when the PR is MERGEABLE, required checks are green, and loop counters under workpad `### Loop counters` are under the cap. Either five required-check failure cycles (`ciFailCycles`) or five checker-fail returns (`reviewLoops`) blocks Auto-merge — the issue stays Ready for merge for Nicklas. On refuse (loop cap, CONFLICTING, missing counters), Auto-merge stays Ready for merge and writes one workpad note plus one role comment. Nicklas can still move Merging when delegate is empty; land still merges to `development`. A conflict (`CONFLICTING`) or missing counters is not force-resolved. Staging and production stay human Cursor later.

Status: accepted
