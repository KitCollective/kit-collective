#!/usr/bin/env node
/**
 * Audit receipt (ADR-0056): a script, not the orchestrator's prose, posts the commit status
 * `kc/audit` on the audited SHA from the reviewer thread's own result.
 *
 * Usage: node scripts/audit-receipt.mjs post <pr> --thread thr_x [--implementer-thread thr_y]
 *          [--require-different-model] [--dry-run]
 *        node scripts/audit-receipt.mjs check <pr>
 *   post   reads `bb thread show <thread> --json` and `bb thread output <thread> --json`, takes the
 *          PR head from GitHub, refuses unless the thread started after the head commit and its
 *          final output holds `AUDIT-RESULT KIT-n green|amber|red <head-sha> [rows,...]`. It then
 *          sets `kc/audit` (success for green and amber, failure for red) whose description names
 *          the thread id, provider, model and SHA, and appends an `audit` event to the run log.
 *   check  exit 0 only when the PR head carries `kc/audit` = success (the land path).
 * Limits: bb has no SubagentStop hook, so this is provenance, not unforgeability. Anyone whose
 * token may write commit statuses can post the context by hand; the status says which thread claims
 * the audit, and the script refuses what it can verify (thread exists, is newer than the head,
 * answered for this exact head, other model than the implementer when asked).
 * One line out. Exit: 0 posted or present, 1 refused or not green, 2 usage, 4 a source failed.
 */
import { execFileSync } from "node:child_process";
import { AUDIT_CONTEXT, evaluateReceipt } from "./lib/audit-receipt.mjs";
import { config, events, gh, logGate } from "./lib/gate-io.mjs";
import { append, logPath } from "./lib/run-log.mjs";

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
  const committed = JSON.parse(
    await gh(["api", `repos/${repo}/commits/${head}`, "--jq", "{date: .commit.committer.date}"]),
  ).date;
  const implementerId = opt("--implementer-thread");
  const implementer = implementerId ? bb("thread", "show", implementerId).thread : null;
  const result = evaluateReceipt({
    thread: {
      id: shown.thread.id,
      providerId: shown.thread.providerId,
      model: shown.thread.model,
      createdAt: shown.thread.createdAt,
    },
    output,
    head,
    headCommittedAt: Date.parse(committed),
    implementer,
    requireDifferentModel: rest.includes("--require-different-model"),
  });
  if (!result.ok) {
    out(1, `REFUSED (receipt): ${result.refusal}`);
  }
  if (!rest.includes("--dry-run")) {
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
    const round =
      events().filter((e) => e.event === "audit" && e.issue === result.issue).length + 1;
    try {
      append(
        {
          event: "audit",
          issue: result.issue,
          verdict: result.verdict,
          round,
          sha: head,
          ...(result.rows.length ? { rows: result.rows } : {}),
        },
        { path: logPath() },
      );
    } catch (error) {
      process.stderr.write(`run-log: ${error.message}\n`);
    }
    logGate(result.issue, "review", result.verdict === "red" ? "closed" : "open", head);
  }
  out(
    0,
    `${rest.includes("--dry-run") ? "WOULD POST" : "POSTED"} (receipt): ${AUDIT_CONTEXT} ${result.state}: ${result.description}`,
  );
} catch (error) {
  out(4, `UNKNOWN (receipt): ${String(error.message).split("\n")[0]}`);
}
