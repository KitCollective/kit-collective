# The run log is central and written by the orchestrator only

Nicklas, 2026-10-10. To judge whether the lead (ADR-0051) pays for itself, and to see where review rounds and tokens go, the flow needs a log. Optio keeps one per checkout, in the git common dir; that fails here because bb workers run on several machines (the owner's Mac and a Docker container on a server), so each would hold a fragment.

Decisions:

1. **One log, written only by the orchestrator thread.** Workers never write it; the orchestrator logs what it sees (spawn, result line, audit verdict). `scripts/lib/run-log.mjs` and `scripts/run-log.mjs`. JSON lines: `start`, `spawn`, `result`, `gate`, `audit`, `reason`.
2. **Fixed vocabulary, no free text.** Every field is validated against a fixed shape: issue key, step (`lead`, `engineer`, `reviewer`, `lander`), bb thread id, provider and model words, token counts or null, outcome, verdict, round, SHA, failing matrix rows, and a reason from a closed code list (a failed row is `row-<lock row id>`). A value outside the shape is refused, so no secret or sentence can reach the file.
3. **Location.** `flow.runLog` in `factory.config.json`, default `.factory/run-log.jsonl` in the main checkout (found through the git common dir, so every worktree of that clone agrees), gitignored. `KC_RUN_LOG` overrides it for tests. The log is local to the machine the orchestrator runs on; that is the point of one writer.
4. **Tokens.** Filled from `bb thread show <id> --json` when it exposes usage. At the time of writing it does not (it returns the thread, environment and PR status only), so tokens are recorded as null, the report prints `n/a`, and it counts issues with no tokens. Token numbers can still be passed by hand (`--tokens-in`, `--tokens-out`).
5. **Report.** `node scripts/run-log.mjs report` prints, with and without a lead: issues, landed, mean review rounds, share of first audits that were red, mean tokens per issue, the share of tokens spent after the first red audit (rework), and tokens per step. This answers ADR-0051's question. Until bb exposes usage the rounds and red-audit share carry the answer and the token columns stay `n/a`.

Gives up: no history across machines or after the checkout is deleted; a crashed orchestrator loses the events it had not yet written.

Status: accepted.
