# The audit receipt is provenance, not unforgeability

Nicklas, 2026-10-10, with ADR-0050 and ADR-0053. In Optio a Claude Code `SubagentStop` hook writes the audit receipt, so the orchestrator cannot claim a review that did not happen. Here the review runs as its own hidden bb thread, and bb has no such hook.

**Decision.** `scripts/audit-receipt.mjs post <pr> --thread <reviewer>` is run by the orchestrator, and a script, not the orchestrator's prose, sets the commit status `kc/audit` on the audited SHA: `success` for green and amber, `failure` for red. Its description holds the reviewer thread id, provider, model and the short SHA. **Token permission (operational).** Posting needs a token with "Commit statuses: Read and write" (fine-grained) or `repo:status`. With read-only statuses the post ends `UNKNOWN (receipt): token lacks Commit statuses write`; a person raises the permission, the script never touches tokens.

**What it checks.** Thread facts (existence, creation time, provider) come from bb; the provider and model come from the **run log**, where the orchestrator wrote them at spawn, because `bb thread show --json` has no model field. It refuses unless:

- the thread exists and started **after** the head commit (a reviewer that began earlier cannot have read this head);
- the run log holds a `spawn reviewer` event for this exact thread and issue, the thread is none of the issue's `spawn engineer` threads, and the logged provider matches bb's;
- its final output ends with an **exact line**: `AUDIT-RESULT <KIT-n> <green|amber|red> <sha 7-40 hex>( <row>(,<row>)*)?`, as the last non-empty line, alone on it (optionally wrapped whole in `**` or backticks), naming exactly this head SHA. Rows are lock-row ids, comma separated without spaces, and only on amber or red. A caveat on the same line, text after it (after `\n`, `\r`, `\f`, `\v`, NEL or the Unicode line and paragraph separators), a quoted example, an unknown row or a green with rows is no result and the receipt refuses. One grammar (`scripts/lib/audit-result.mjs`) serves the receipt and the run log's row check, so they cannot disagree. LEAD-RESULT and ENGINEER-RESULT keep the generic last-line parser, their sentence being free text;
- with `--require-different-model` (recommended, not mandatory: model is only as honest as the log), the reviewer's logged provider and model differ from every engineer spawn of the issue, thread logged or not. Provider and model must be logged for the reviewer and for every engineer spawn, or the check refuses; `run-log.mjs` itself refuses an engineer or reviewer spawn without thread, provider and model.

It also appends the `audit` event to the run log. `audit-receipt.mjs check <pr>` is the land-path read: exit 0 only on `kc/audit` = success on the current head.

**Order and exits.** The receipt validates everything, including the `audit` event it will log, before it posts the status, and refuses without posting if the event would be invalid. If the post succeeds and the log write then fails, it exits 5 with `POSTED but not logged (<reason>)`. Model comparison trims and lower-cases both sides; aliases (`sonnet` against `claude-sonnet-5-5`) are NOT resolved, so the check is only as good as the logged value.

**Limits, stated plainly.** This is provenance, not unforgeability. Any session whose token may write commit statuses can post `kc/audit` by hand, and the orchestrator chooses which thread id to pass. What the script adds is that a faked audit now needs a deliberate forgery of the GitHub status instead of a sentence in a comment, and that an honest run leaves a thread id someone can open. A stronger version needs bb to sign a thread result or to run a stop hook; until then the human-started session remains the approver.

Gives up: a repo token with `statuses: write` on the machine that runs the orchestrator.

Status: accepted; revisit if bb gains a stop hook.

Consequence (2026-10-19): besides the exact line, the receipt accepts the input of the Reviewer thread's own final `bb_workflow_result` call from that thread's event log (verdict, full head sha, rows); when both are present they must agree. See ADR-0058, consequence of 2026-10-19.
