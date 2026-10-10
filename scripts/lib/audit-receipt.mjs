/**
 * Audit receipt (ADR-0056): decides whether a reviewer thread's result may become the commit
 * status `kc/audit` on the audited SHA. Pure: the CLI gathers the thread, its final output and
 * the head commit time from bb and GitHub.
 *
 * Provenance, not unforgeability. bb has no SubagentStop hook, so nothing stops a session that
 * holds a token with the right scope from posting the status by hand. The receipt records which
 * thread audited which SHA, and the script refuses what can be checked: the thread exists, was
 * created after the head commit, produced an AUDIT-RESULT line for exactly this head, and (when
 * asked) ran on another provider or model than the implementer.
 */
import { parseResultLine } from "./gates.mjs";

export const AUDIT_CONTEXT = "kc/audit";
const VERDICTS = ["green", "amber", "red"];

/**
 * @param {{
 *   thread: { id: string, providerId?: string, model?: string, createdAt: number },
 *   output: string,
 *   head: string,
 *   headCommittedAt: number,
 *   implementer?: { providerId?: string, model?: string } | null,
 *   requireDifferentModel?: boolean,
 * }} o createdAt and headCommittedAt are epoch milliseconds
 * @returns {{ ok: boolean, refusal?: string, state?: "success" | "failure", verdict?: string,
 *   issue?: string, rows?: string[], description?: string }}
 */
export function evaluateReceipt({
  thread,
  output,
  head,
  headCommittedAt,
  implementer = null,
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
  const parsed = parseResultLine("AUDIT-RESULT", output);
  if (!parsed) {
    return { ok: false, refusal: `thread ${thread.id} returned no AUDIT-RESULT line` };
  }
  if (!VERDICTS.includes(parsed.outcome)) {
    return { ok: false, refusal: `verdict ${parsed.outcome} is not green, amber or red` };
  }
  const [auditedSha, rowList = ""] = parsed.rest.split(/\s+/);
  if (
    !auditedSha ||
    auditedSha.length < 7 ||
    !head.toLowerCase().startsWith(auditedSha.toLowerCase())
  ) {
    return {
      ok: false,
      refusal: `thread audited ${auditedSha || "no sha"}, the head is ${head.slice(0, 7)}`,
    };
  }
  if (
    requireDifferentModel &&
    implementer?.providerId &&
    thread.providerId &&
    implementer.providerId === thread.providerId &&
    (implementer.model ?? "") === (thread.model ?? "")
  ) {
    return {
      ok: false,
      refusal: `reviewer runs on the same provider and model as the implementer (${thread.providerId})`,
    };
  }
  const provider = thread.providerId ?? "unknown";
  const model = thread.model ?? "unknown";
  return {
    ok: true,
    state: parsed.outcome === "red" ? "failure" : "success",
    verdict: parsed.outcome,
    issue: parsed.issue,
    rows: rowList ? rowList.split(",").filter(Boolean) : [],
    // GitHub limits a status description to 140 characters.
    description:
      `audit ${parsed.outcome} by ${thread.id} (${provider}/${model}) at ${head.slice(0, 7)}`.slice(
        0,
        140,
      ),
  };
}
