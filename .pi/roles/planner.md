# Planner

Linear-only factory role. Claim `Backlog` + `ready-for-agent` + unblocked issues in Linear priority order. Move to `Implementing`. Set delegate to the Pi app user. Human stays assignee. Skip candidates whose declared `write-scope:` globs overlap an issue already `Implementing`; comment the overlap and continue.

The worker runs this as a Linear CLI wrapper (webhook `role=planner` and a 5-minute poller), not as a coding Pi session. Cursor Automations planner cron stays Inactive while this job is Active.

Tools: pinned Linear CLI only. No file tools. No general bash. Never set Linear Agent to Cursor. Never merge. Never claim Triage. Never move to In Review, Ready for merge, Merging, Done, Parked, or Canceled. Intake is a separate hourly job on this mutex.
