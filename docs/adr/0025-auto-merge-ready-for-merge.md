# Auto-merge may set Merging under a loop cap

Ready for merge used to wait for Nicklas. The worker may move Ready for merge → Merging when delegate is Pi, the PR is MERGEABLE, required checks are green, and loop counters under workpad `### Loop counters` are under the cap. Either five required-check failure cycles (`ciFailCycles`) or five checker-fail returns (`reviewLoops`) blocks Auto-merge — the issue stays Ready for merge for Nicklas. On refuse (loop cap, CONFLICTING, missing counters, or delegate already empty), Auto-merge stays Ready for merge, sets delegate to `null`, and writes one workpad note. Implementing, In Review, and Ready for merge keep Pi as delegate until Auto-merge decides. Done and Canceled clear leftover Pi delegate. Nicklas can still move Merging when delegate is empty; land still merges to `development`. A conflict (`CONFLICTING`) or missing counters is not force-resolved. Staging and production stay human Cursor later.

Status: accepted
