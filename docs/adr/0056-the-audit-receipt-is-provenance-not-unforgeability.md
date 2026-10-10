# The audit receipt is provenance, not unforgeability

Nicklas, 2026-10-10, with ADR-0050 and ADR-0053. In Optio a Claude Code `SubagentStop` hook writes the audit receipt, so the orchestrator cannot claim a review that did not happen. Here the review runs as its own hidden bb thread, and bb has no such hook.

**Decision.** `scripts/audit-receipt.mjs post <pr> --thread <reviewer>` is run by the orchestrator, and a script, not the orchestrator's prose, sets the commit status `kc/audit` on the audited SHA: `success` for green and amber, `failure` for red. Its description holds the reviewer thread id, provider, model and the short SHA. It reads the thread from bb (`bb thread show`, `bb thread output`) and the head from GitHub, and refuses unless:

- the thread exists and started **after** the head commit (a reviewer that began earlier cannot have read this head);
- its final output holds `AUDIT-RESULT KIT-n green|amber|red <sha> [rows]` for exactly this head SHA;
- with `--require-different-model`, its provider and model differ from the implementer's thread where both are known (bb's thread record shows the provider; the model field is absent today, so only the provider is compared in practice).

It also appends the `audit` event to the run log. `audit-receipt.mjs check <pr>` is the land-path read: exit 0 only on `kc/audit` = success on the current head.

**Limits, stated plainly.** This is provenance, not unforgeability. Any session whose token may write commit statuses can post `kc/audit` by hand, and the orchestrator chooses which thread id to pass. What the script adds is that a faked audit now needs a deliberate forgery of the GitHub status instead of a sentence in a comment, and that an honest run leaves a thread id someone can open. A stronger version needs bb to sign a thread result or to run a stop hook; until then the human-started session remains the approver.

Gives up: a repo token with `statuses: write` on the machine that runs the orchestrator.

Status: accepted; revisit if bb gains a stop hook.
