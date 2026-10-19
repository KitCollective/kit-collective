/**
 * Audit receipt (ADR-0056): decides whether a reviewer thread's result may become the commit
 * status `kc/audit` on the audited SHA. Pure: the CLI gathers the thread, its final output and
 * the head commit time from bb and GitHub.
 *
 * Provenance, not unforgeability. bb has no SubagentStop hook, so nothing stops a session that
 * holds a token with the right scope from posting the status by hand. The receipt records which
 * thread audited which SHA, and the script refuses what can be checked: the thread exists, was
 * created after the head commit, gave a verdict for exactly this head, and (when asked) ran on
 * another provider or model than the implementer, judged from the run log.
 *
 * The verdict is read from the Reviewer's own thread, never from what the workflow or an
 * orchestrator relays (ADR-0058): the exact AUDIT-RESULT line as its last text, or the input of its
 * own final `bb_workflow_result` tool call in its event log. Both are written by the Reviewer model
 * in its own thread; when both are there they must agree.
 */
import { AUDIT_VERDICTS, parseAuditResult, ROW_IDS } from "./audit-result.mjs";

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
 *   events?: Array<object>,
 *   head: string,
 *   headCommittedAt: number,
 *   spawns: Array<{ issue: string, step: string, thread?: string, provider?: string, model?: string }>,
 *   implementerThread?: string,
 *   requireDifferentModel?: boolean,
 * }} o createdAt and headCommittedAt are epoch milliseconds; `spawns` are the run log's spawn events;
 * `events` is the thread's own event log (`bb thread log <id> --json --all`)
 * @returns {{ ok: boolean, refusal?: string, state?: "success" | "failure", verdict?: string,
 *   issue?: string, rows?: string[], description?: string, source?: string }}
 */
export function evaluateReceipt({
  thread,
  output,
  events = [],
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
  const line = parseAuditResult(output);
  const call = resultCall(events, thread.id);
  if (call.refusal) {
    return { ok: false, refusal: call.refusal };
  }
  if (!line && !call.result) {
    return {
      ok: false,
      refusal: `thread ${thread.id} did not end with an exact AUDIT-RESULT line (nothing else on the line or after it), and its last tool call is no ${RESULT_TOOL} call`,
    };
  }
  if (line && !head.toLowerCase().startsWith(line.sha)) {
    return {
      ok: false,
      refusal: `thread audited ${line.sha}, the head is ${head.slice(0, 7)}`,
    };
  }
  if (call.result && call.result.sha !== head.toLowerCase()) {
    return {
      ok: false,
      refusal: `the thread's ${RESULT_TOOL} call audited ${call.result.sha.slice(0, 12)}, the head is ${head.slice(0, 7)}`,
    };
  }
  if (line && call.result) {
    const sameRows =
      line.rows.length === call.result.rows.length &&
      line.rows.every((row) => call.result.rows.includes(row));
    if (line.verdict !== call.result.verdict || !sameRows) {
      return {
        ok: false,
        refusal: `the AUDIT-RESULT line (${line.verdict} ${line.rows.join(",") || "no rows"}) and the ${RESULT_TOOL} call (${call.result.verdict} ${call.result.rows.join(",") || "no rows"}) of ${thread.id} disagree`,
      };
    }
  }
  // The result call names no issue: the run log's spawn reviewer event for this thread does.
  const reviewerIssues = [
    ...new Set(
      (spawns ?? [])
        .filter((e) => e.step === "reviewer" && e.thread === thread.id)
        .map((e) => e.issue),
    ),
  ];
  if (!line && reviewerIssues.length !== 1) {
    return {
      ok: false,
      refusal:
        reviewerIssues.length === 0
          ? `the run log has no spawn reviewer event for ${thread.id}`
          : `the run log has spawn reviewer events for ${thread.id} on ${reviewerIssues.join(", ")}`,
    };
  }
  const parsed = line
    ? line
    : { issue: reviewerIssues[0], verdict: call.result.verdict, rows: call.result.rows };
  const source = line && call.result ? "line and result call" : line ? "line" : "result call";
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
    source,
  };
}

/** The workflow result tool, as bb records it (bare) or as Claude Code names the MCP tool. */
export const RESULT_TOOL = "bb_workflow_result";
const RESULT_TOOL_NAME = /^(?:mcp__bb-bridge__)?bb_workflow_result$/;
/** Items that are the model talking or thinking; every other item type is a tool call. */
const NOT_TOOLS = new Set(["reasoning", "agentMessage", "userMessage"]);

/**
 * The Reviewer's verdict as the input of its own final `bb_workflow_result` call, read from its
 * thread's raw event log. bb stops a workflow worker as soon as it calls the result tool, so a
 * Reviewer that skips the final text line still leaves this call in its own log (KIT-432, KIT-431,
 * KIT-405 on 2026-10-19). Counts only when it is the thread's last tool call.
 *
 * @param {Array<any>} events `bb thread log <id> --json --all`
 * @param {string} threadId
 * @returns {{ result?: { verdict: string, sha: string, rows: string[] }, refusal?: string }}
 *   neither when the last tool call is no result call (or there is none)
 */
export function resultCall(events, threadId) {
  const items = new Map();
  const ordered = [...(Array.isArray(events) ? events : [])].sort(
    (a, b) => Number(a?.seq) - Number(b?.seq),
  );
  for (const event of ordered) {
    if (event?.threadId !== threadId) {
      continue;
    }
    if (event.type !== "item/started" && event.type !== "item/completed") {
      continue;
    }
    const item = event.data?.item;
    if (!item || typeof item.id !== "string") {
      continue;
    }
    const seen = items.get(item.id);
    items.set(item.id, { seq: seen?.seq ?? event.seq, item: { ...seen?.item, ...item } });
  }
  const last = [...items.values()]
    .sort((a, b) => a.seq - b.seq)
    .filter(({ item }) => !NOT_TOOLS.has(item.type))
    .at(-1)?.item;
  if (!last || last.type !== "toolCall" || !RESULT_TOOL_NAME.test(String(last.tool))) {
    return {};
  }
  const bad = (why) => ({
    refusal: `the last ${RESULT_TOOL} call of ${threadId} is no valid verdict: ${why}`,
  });
  if (/fail|error|declin|reject/i.test(String(last.status ?? ""))) {
    return bad(`the call ended ${last.status}`);
  }
  const args = last.arguments;
  const value = args && typeof args.value === "object" && args.value !== null ? args.value : args;
  if (!value || typeof value !== "object") {
    return bad("it has no input");
  }
  if (!AUDIT_VERDICTS.includes(value.verdict)) {
    return bad(`verdict ${JSON.stringify(value.verdict)}`);
  }
  if (typeof value.sha !== "string" || !/^[0-9a-f]{40}$/i.test(value.sha)) {
    return bad("the sha is not a full 40-character sha");
  }
  const rows = value.rows ?? [];
  if (
    !Array.isArray(rows) ||
    !rows.every((row) => ROW_IDS.includes(row)) ||
    new Set(rows).size !== rows.length ||
    (value.verdict === "green" && rows.length > 0)
  ) {
    return bad("rows are not distinct lock-row ids (and none on green)");
  }
  if (value.threadId !== undefined && value.threadId !== threadId) {
    return bad(`it names thread ${value.threadId}`);
  }
  return { result: { verdict: value.verdict, sha: value.sha.toLowerCase(), rows: [...rows] } };
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
  const sha = head.slice(0, 7);
  const fixed = `audit ${verdict} by  () at ${sha}`.length; // everything except the id and provider/model
  const who = `${provider}/${model}`;
  const clip = (text, room) =>
    text.length <= room ? text : `${text.slice(0, Math.max(room - 1, 0))}…`;
  // provider/model shrinks first, the thread id only when it alone does not fit
  const shown = clip(who, 140 - fixed - thread.length);
  const id = clip(thread, 140 - fixed - shown.length);
  return `audit ${verdict} by ${id} (${shown}) at ${sha}`;
}
