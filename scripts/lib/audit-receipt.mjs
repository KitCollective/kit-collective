/**
 * Audit receipt (ADR-0056): decides whether a reviewer thread's result may become the commit
 * status `kc/audit` on the audited SHA. Pure: the CLI gathers the thread, its final output and
 * the head commit time from bb and GitHub.
 *
 * Provenance, not unforgeability. bb has no SubagentStop hook, so nothing stops a session that
 * holds a token with the right scope from posting the status by hand. The receipt records which
 * thread audited which SHA, and the script refuses what can be checked: the thread exists, was
 * created after the head commit, produced an AUDIT-RESULT line for exactly this head, and (when
 * asked) ran on another provider or model than the implementer, judged from the run log.
 */
import { parseAuditResult } from "./audit-result.mjs";

export const AUDIT_CONTEXT = "kc/audit";

/**
 * Provider and model come from the run log, where the orchestrator wrote them at spawn, because
 * `bb thread show --json` has a provider and a creation time but no model. The log must hold a
 * `spawn reviewer` event for exactly this thread and issue, and none of the issue's engineer
 * threads may be the reviewer.
 *
 * @param {{
 *   thread: { id: string, providerId?: string, createdAt: number },
 *   output: string,
 *   head: string,
 *   headCommittedAt: number,
 *   spawns: Array<{ issue: string, step: string, thread?: string, provider?: string, model?: string }>,
 *   implementerThread?: string,
 *   requireDifferentModel?: boolean,
 * }} o createdAt and headCommittedAt are epoch milliseconds; `spawns` are the run log's spawn events
 * @returns {{ ok: boolean, refusal?: string, state?: "success" | "failure", verdict?: string,
 *   issue?: string, rows?: string[], description?: string }}
 */
export function evaluateReceipt({
  thread,
  output,
  head,
  headCommittedAt,
  spawns,
  implementerThread,
  requireDifferentModel = false,
}) {
  if (!/^thr_[a-z0-9]{4,32}$/.test(thread?.id ?? "")) {
    return { ok: false, refusal: "not a bb thread id" };
  }
  if (!(thread.createdAt >= headCommittedAt)) {
    return {
      ok: false,
      refusal: `thread ${thread.id} started before the head commit, so it cannot have read this head`,
    };
  }
  const parsed = parseAuditResult(output);
  if (!parsed) {
    return {
      ok: false,
      refusal: `thread ${thread.id} did not end with an exact AUDIT-RESULT line (nothing else on the line or after it)`,
    };
  }
  if (!head.toLowerCase().startsWith(parsed.sha)) {
    return {
      ok: false,
      refusal: `thread audited ${parsed.sha}, the head is ${head.slice(0, 7)}`,
    };
  }
  const forIssue = (spawns ?? []).filter((e) => e.issue === parsed.issue);
  // Every engineer spawn of the issue counts, whether or not a thread id was logged for it.
  const engineers = forIssue.filter((e) => e.step === "engineer");
  if (thread.id === implementerThread || engineers.some((e) => e.thread === thread.id)) {
    return { ok: false, refusal: `thread ${thread.id} is an implementer thread, not a reviewer` };
  }
  const reviewer = forIssue.find((e) => e.step === "reviewer" && e.thread === thread.id);
  if (!reviewer) {
    return {
      ok: false,
      refusal: `the run log has no spawn reviewer event for ${thread.id} on ${parsed.issue}`,
    };
  }
  if (reviewer.provider && thread.providerId && reviewer.provider !== thread.providerId) {
    return {
      ok: false,
      refusal: `run log says provider ${reviewer.provider}, bb says ${thread.providerId}`,
    };
  }
  if (requireDifferentModel) {
    const known = (e) => e.provider && e.model;
    if (!known(reviewer)) {
      return {
        ok: false,
        refusal:
          "different model requested, but provider and model are not logged for the reviewer",
      };
    }
    if (engineers.length === 0 || !engineers.every(known)) {
      return {
        ok: false,
        refusal:
          "different model requested, but provider and model are not logged for every engineer spawn",
      };
    }
    const norm = (value) => String(value).trim().toLowerCase();
    if (
      engineers.some(
        (e) =>
          norm(e.provider) === norm(reviewer.provider) && norm(e.model) === norm(reviewer.model),
      )
    ) {
      return {
        ok: false,
        refusal: `reviewer runs on ${reviewer.provider}/${reviewer.model}, the same as an engineer spawn`,
      };
    }
  }
  const provider = reviewer.provider ?? thread.providerId ?? "unknown";
  const model = reviewer.model ?? "unknown";
  return {
    ok: true,
    state: parsed.verdict === "red" ? "failure" : "success",
    verdict: parsed.verdict,
    issue: parsed.issue,
    rows: parsed.rows,
    description: describe({ verdict: parsed.verdict, thread: thread.id, provider, model, head }),
  };
}

/**
 * A refused status POST from `gh api` ("Resource not accessible", or HTTP 403 without a rate-limit
 * message) means the token cannot write commit statuses; say so. A 404 (wrong repo or sha) or a rate
 * limit returns null, so the caller prints gh's own first line.
 * @param {{ message?: string, stderr?: string }} error
 * @returns {string | null}
 */
export function statusPermissionLine(error) {
  // stderr only: error.message carries the command line, including the status description.
  const text = String(error?.stderr ?? "");
  if (/rate limit|abuse|secondary/i.test(text)) {
    return null;
  }
  return /Resource not accessible|HTTP 403/i.test(text)
    ? "token lacks Commit statuses write"
    : null;
}

/**
 * The tool's own first stderr line for a failed `gh` or `bb` call, never the command line (which
 * holds arguments such as the status description). Without stderr: the message of a non-command
 * error (e.g. bad JSON), or a neutral line.
 */
export function ghMessage(error) {
  const line = String(error?.stderr ?? "")
    .trim()
    .split("\n")[0];
  if (line) {
    return line;
  }
  const message = String(error?.message ?? "").split("\n")[0];
  return message && !message.startsWith("Command failed") ? message : "command failed";
}

/**
 * `audit <verdict> by <thread> (<provider>/<model>) at <sha7>`, at most 140 characters (GitHub's
 * limit). A long provider/model is shortened with an ellipsis; the thread id and the sha always
 * stay whole, because they are the provenance.
 */
export function describe({ verdict, thread, provider, model, head }) {
  const prefix = `audit ${verdict} by ${thread} (`;
  const suffix = `) at ${head.slice(0, 7)}`;
  const room = 140 - prefix.length - suffix.length;
  const who = `${provider}/${model}`;
  const shown = who.length <= room ? who : `${who.slice(0, Math.max(room - 1, 0))}…`;
  return `${prefix}${shown}${suffix}`;
}
