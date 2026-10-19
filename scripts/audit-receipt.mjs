#!/usr/bin/env node
/**
 * Audit receipt (ADR-0056): a script, not the orchestrator's prose, posts the commit status
 * `kc/audit` on the audited SHA from the reviewer thread's own result.
 *
 * Usage: node scripts/audit-receipt.mjs post <pr> --thread thr_x [--implementer-thread thr_y]
 *          [--require-different-model] [--dry-run]
 * Needs a token with "Commit statuses: Read and write" (fine-grained) or `repo:status`; without it
 * the post ends `UNKNOWN (receipt): token lacks Commit statuses write`.
 *        node scripts/audit-receipt.mjs check <pr>
 *   post   needs a `spawn reviewer` event for this thread and issue in the run log (provider and model
 *          come from there: bb shows no model) and refuses a thread that is one of the issue's engineer
 *          threads. Reads `bb thread show <thread> --json` and `bb thread output <thread> --json`, takes the
 *          PR head from GitHub, refuses unless the thread started after the head commit and gave its
 *          verdict for this head in its own thread: its final output ends with the exact line
 *          `AUDIT-RESULT KIT-n green|amber|red <head-sha> [rows,...]`, or its last tool call is
 *          `bb_workflow_result` with the verdict, the full head sha and the rows (read from
 *          `bb thread log <thread> --json --all`; bb stops a worker at that call, so the line is often
 *          missing). When both are there they must agree. It then
 *          sets `kc/audit` (success for green and amber, failure for red) whose description names
 *          the thread id, provider, model and SHA, and appends an `audit` event to the run log.
 *   check  exit 0 only when the PR head carries `kc/audit` = success (the land path).
 * Limits: bb has no SubagentStop hook, so this is provenance, not unforgeability. Anyone whose
 * token may write commit statuses can post the context by hand; the status says which thread claims
 * the audit, and the script refuses what it can verify (thread exists, is newer than the head,
 * answered for this exact head, logged as a reviewer and not an engineer, other model than the
 * engineer's per the run log when asked; `--require-different-model` is a recommendation, because bb
 * itself has no model field).
 * The audit event is validated before anything is posted. One line out. Exit: 0 posted or present,
 * 1 refused or not green, 2 usage, 4 a source failed, 5 `POSTED but not logged` (the status is set, the
 * run log write failed).
 */
import { execFileSync } from "node:child_process";
import {
  AUDIT_CONTEXT,
  evaluateReceipt,
  ghMessage,
  statusPermissionLine,
} from "./lib/audit-receipt.mjs";
import { config, events, gh, logGate } from "./lib/gate-io.mjs";
import { append, logPath, validateEvent } from "./lib/run-log.mjs";

const [action, pr, ...rest] = process.argv.slice(2);
const opt = (name) => {
  const at = rest.indexOf(name);
  return at === -1 ? undefined : rest[at + 1];
};
const out = (code, line) => {
  process.stdout.write(`${line}\n`);
  process.exit(code);
};
if (
  !["post", "check"].includes(action) ||
  !/^\d+$/.test(pr ?? "") ||
  (action === "post" && !opt("--thread"))
) {
  process.stderr.write(
    "usage: audit-receipt.mjs post <pr> --thread thr_x [--implementer-thread thr_y] [--require-different-model] [--dry-run] | check <pr>\n",
  );
  process.exit(2);
}

const bb = (...args) =>
  JSON.parse(
    execFileSync("bb", [...args, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
const repo = config().github.ownerRepo;

try {
  const head = JSON.parse(
    await gh(["pr", "view", pr, "--repo", repo, "--json", "headRefOid"]),
  ).headRefOid;
  const statuses = JSON.parse(await gh(["api", `repos/${repo}/commits/${head}/statuses`]));
  const current = statuses.find((s) => s.context === AUDIT_CONTEXT);

  if (action === "check") {
    out(
      current?.state === "success" ? 0 : 1,
      current?.state === "success"
        ? `OPEN: ${AUDIT_CONTEXT} success on ${head.slice(0, 7)}: ${current.description}`
        : `CLOSED: no ${AUDIT_CONTEXT} success on ${head.slice(0, 7)}`,
    );
  }

  const shown = bb("thread", "show", opt("--thread"));
  const output = bb("thread", "output", opt("--thread")).output ?? "";
  // The thread's own raw event log, for its final bb_workflow_result call (ADR-0058, 2026-10-19).
  const threadEvents = bb("thread", "log", opt("--thread"), "--all");
  if (!Array.isArray(threadEvents)) {
    throw new Error("bb thread log returned no event list");
  }
  const committed = JSON.parse(
    await gh(["api", `repos/${repo}/commits/${head}`, "--jq", "{date: .commit.committer.date}"]),
  ).date;
  const result = evaluateReceipt({
    thread: {
      id: shown.thread.id,
      providerId: shown.thread.providerId,
      createdAt: shown.thread.createdAt,
    },
    output,
    events: threadEvents,
    head,
    headCommittedAt: Date.parse(committed),
    spawns: events().filter((e) => e.event === "spawn"),
    implementerThread: opt("--implementer-thread"),
    requireDifferentModel: rest.includes("--require-different-model"),
  });
  if (!result.ok) {
    out(1, `REFUSED (receipt): ${result.refusal}`);
  }
  // Everything is validated BEFORE the status is posted, including the event that will be logged.
  const round = events().filter((e) => e.event === "audit" && e.issue === result.issue).length + 1;
  const auditEvent = {
    event: "audit",
    issue: result.issue,
    verdict: result.verdict,
    round,
    sha: head,
    ...(result.rows.length ? { rows: result.rows } : {}),
  };
  const invalid = validateEvent(auditEvent);
  if (invalid.length > 0) {
    out(
      1,
      `REFUSED (receipt): the audit event would be invalid (${invalid.join("; ")}); nothing posted`,
    );
  }
  if (!rest.includes("--dry-run")) {
    try {
      await gh([
        "api",
        `repos/${repo}/statuses/${head}`,
        "-f",
        `state=${result.state}`,
        "-f",
        `context=${AUDIT_CONTEXT}`,
        "-f",
        `description=${result.description}`,
      ]);
    } catch (error) {
      out(4, `UNKNOWN (receipt): ${statusPermissionLine(error) ?? ghMessage(error)}`);
    }
    try {
      append(auditEvent, { path: logPath() });
    } catch (error) {
      out(
        5,
        `POSTED but not logged (${String(error.message).split("\n")[0]}): ${AUDIT_CONTEXT} ${result.state} on ${head.slice(0, 7)}`,
      );
    }
    logGate(result.issue, "review", result.verdict === "red" ? "closed" : "open", head);
  }
  out(
    0,
    `${rest.includes("--dry-run") ? "WOULD POST" : "POSTED"} (receipt): ${AUDIT_CONTEXT} ${result.state}: ${result.description} (verdict from the thread's ${result.source})`,
  );
} catch (error) {
  out(4, `UNKNOWN (receipt): ${ghMessage(error)}`);
}
