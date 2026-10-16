# The Factory dispatches, and gate verdicts are the Factory's

Nicklas, 2026-10-15. Status: accepted. Supersedes the sentence "No dispatch worker runs" in `AGENTS.md` and the dispatch-free runtime it describes (written after the PI worker was archived, `docs/agents/pi-harness-archived.md`). Builds on ADR-0052, ADR-0053, ADR-0056 and ADR-0058.

Two things grew up around bb without a decision. A script automation (`kit-dispatch.js`, every five minutes) reads Linear and wakes a model thread that chooses and starts `kit-issue` runs, while the docs still say nothing dispatches. And every gate verdict in a `kit-issue` run reaches the workflow through a runner model that reads exit codes aloud, which is why ADR-0058 says those verdicts are not merge-grade. Both now move into one bb plugin, the **Factory**, which lives in this repo.

## Decisions

1. **The Board is the only dispatcher.** The Factory's Board reads Linear every tick and starts Loops from the Loop registry in `factory.config.json`, within each machine's capacity and without write-scope overlap. Its choice is code, not a model's judgement. `kit-dispatch.js` is paused when the Board goes live and deleted after a week of clean running; no second dispatcher runs beside the Board.
2. **A gate verdict counts only when the Factory ran the gate.** The Factory exposes a gate tool to agents; it runs the gate script on the machine of the calling thread through the plugin's host worker and records the exit code and verdict line itself. Hand-over and the Board read that record, never a model's account of it. Once this holds, ADR-0058's "not merge-grade" caveat no longer applies to runs that used it.

## Known limits

- A plugin cannot start a bb workflow directly; the Board starts a Loop through a launcher thread whose only job is `bb workflows run`. We keep that and ask bb for a direct API separately.
- The host worker running a script inside a thread's worktree is unproven; the first gate milestone is a spike that proves or refutes it. If it fails, decision 2 is reopened, not worked around with a model relay.
- The Factory is full-trust code inside the bb server. A defect in it can stop every Loop at once, which the dispatcher thread could not.

## Considered

- **Keep the script automation and its dispatcher thread.** Rejected: a model choosing what to start is neither reproducible nor testable, and its state lives in a file beside a copied script.
- **Move to Paperclip.** Rejected for the code factory: its task tracker is built in and Linear support is not started, so it would replace Linear rather than run from it. Parked as a candidate for marketing agents.
