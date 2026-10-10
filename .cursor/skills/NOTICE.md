# Attribution

The lead agent (`.cursor/agents/lead.md`), the start decision (`scripts/lib/start-decision.mjs`), the run log (`scripts/lib/run-log.mjs`, `scripts/lib/run-report.mjs`) and the gate scripts that follow them are adapted from ideas and logic in the Optio project's workflow runner (the `run-workflow` skill, its lead agent, `runlog.mjs`, `reason.mjs` and `start.mjs`). Optio itself adopted this factory's skills first and then evolved them; we take the patterns back, rewritten for this repo, without its `@optio/harness` package or its Jev decision service.
