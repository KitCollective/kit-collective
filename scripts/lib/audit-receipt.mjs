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
import { parseResultLine } from "./gates.mjs";

export const AUDIT_CONTEXT = "kc/audit";
const VERDICTS = ["green", "amber", "red"];

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
  const forIssue = (spawns ?? []).filter((e) => e.issue === parsed.issue);
  const engineers = forIssue.filter((e) => e.step === "engineer" && e.thread);
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
    if (!known(reviewer) || !engineers.some(known)) {
      return {
        ok: false,
        refusal: "different model requested, but provider and model are not logged for both spawns",
      };
    }
    if (
      engineers.some(
        (e) => known(e) && e.provider === reviewer.provider && e.model === reviewer.model,
      )
    ) {
      return {
        ok: false,
        refusal: `reviewer runs on ${reviewer.provider}/${reviewer.model}, the same as an engineer thread`,
      };
    }
  }
  const provider = reviewer.provider ?? thread.providerId ?? "unknown";
  const model = reviewer.model ?? "unknown";
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

/**
 * A refused status POST from `gh api` (HTTP 403 or 404, "Resource not accessible") means the
 * token cannot write commit statuses; say so instead of printing the raw gh error.
 * @param {{ message?: string, stderr?: string }} error
 * @returns {string | null}
 */
export function statusPermissionLine(error) {
  const text = `${error?.stderr ?? ""}\n${error?.message ?? ""}`;
  return /HTTP (403|404)|Resource not accessible|Forbidden|Not Found/i.test(text)
    ? "token lacks Commit statuses write"
    : null;
}
