# Auto-merge may set Merging under a loop cap

Ready for merge used to wait for Nicklas. The worker may move Ready for merge → Merging when the PR is MERGEABLE, required checks are green, and loop counters under workpad `### Loop counters` are under the cap. Either five required-check failure cycles (`ciFailCycles`) or five checker-fail returns (`reviewLoops`) blocks Auto-merge — the issue stays Ready for merge for Nicklas. Land still does the merge to `development`. A conflict (`CONFLICTING`) or missing counters is not force-resolved. Staging and production stay human Cursor later.

Status: accepted
