/**
 * Pure decisions behind the flow gates (ADR-0053). Every function takes what it needs as data
 * and returns `{ code, line }`: the CLIs gather the data (gh, git, Linear, the run log) and print the line.
 * Patterns from Optio's gates (head-changed.sh, session-check.sh, gate.sh land); see .cursor/skills/NOTICE.md.
 */
import { lastLine } from "./audit-result.mjs";
import { requiredChecksGreen } from "./land-policy.mjs";
import { parseWriteScopeGlobs } from "./pr-write-scope.mjs";

export const GATE_EXIT = { open: 0, closed: 1, usage: 2, waiting: 3, unknown: 4 };

const open = (line) => ({ code: GATE_EXIT.open, line: `OPEN: ${line}` });
const closed = (line) => ({ code: GATE_EXIT.closed, line: `CLOSED: ${line}` });

const startsWith = (full, prefix) =>
  typeof prefix === "string" &&
  prefix.length >= 7 &&
  full.toLowerCase().startsWith(prefix.toLowerCase());

/**
 * True when `name` (a branch, ref or title) names the issue with a boundary after the number,
 * so KIT-27 matches `claude/kit-27-x` and `KIT-27: title` but not `claude/kit-276-x`.
 * @param {string} name
 * @param {string} issue e.g. KIT-27
 */
export function matchesIssueKey(name, issue) {
  const key = issue.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return new RegExp(`(?<![a-z0-9])${key}(?![0-9])`).test(String(name).toLowerCase());
}

/**
 * A gate that reads the checkout (diffs, scope) is only valid when the checkout is the PR's head.
 * @param {{ head: string, prHead: string }} o full SHAs
 * @returns {{ ok: boolean, line?: string }}
 */
export function prBound({ head, prHead }) {
  if (!/^[0-9a-f]{40}$/i.test(prHead ?? "") || !/^[0-9a-f]{40}$/i.test(head ?? "")) {
    return { ok: false, line: "UNKNOWN: cannot read the checkout head or the PR head" };
  }
  if (head.toLowerCase() !== prHead.toLowerCase()) {
    return {
      ok: false,
      line: `UNKNOWN: run this gate from the PR's worktree at ${prHead.slice(0, 8)} (HEAD is ${head.slice(0, 8)})`,
    };
  }
  return { ok: true };
}

/**
 * The head a gate acts on: an explicit --head, else the PR's head from GitHub, else (only when
 * no PR is given) the checkout's HEAD. Never the checkout when a PR is named.
 * @param {{ explicit?: string, prHead?: string, checkoutHead?: string }} o
 */
export function resolveHead({ explicit, prHead, checkoutHead }) {
  return explicit ?? prHead ?? checkoutHead ?? "";
}

/**
 * Head-changed: a head already audited red is never audited again.
 * Red is read from the run log (last audit of the issue) and from the workpad
 * (`lastReviewSha` with a non-empty `### Review feedback`).
 * @param {{ head: string, issue: string, events: Record<string, any>[], workpad?: string }} input
 */
export function headChanged({ head, issue, events, workpad = "" }) {
  if (!/^[0-9a-f]{40}$/i.test(head ?? "")) {
    return closed("cannot read the head sha, so the audited head cannot be compared");
  }
  const audits = events.filter((e) => e.event === "audit" && e.issue === issue);
  const last = audits.at(-1);
  if (last?.verdict === "red" && startsWith(head, last.sha)) {
    return closed(`head ${last.sha} was already audited red (run log); change the code first`);
  }
  const reviewed = /lastReviewSha:\s*`?([0-9a-f]{7,40})`?/i.exec(workpad)?.[1];
  const feedback = workpad.split(/^### Review feedback\s*$/m)[1]?.split(/^### /m)[0] ?? "";
  const hasFeedback = feedback.trim() !== "" && !/^\s*-\s*\(none/i.test(feedback.trim());
  if (hasFeedback && startsWith(head, reviewed)) {
    return closed(
      `head ${reviewed} was already reviewed with findings open (workpad); change the code first`,
    );
  }
  return open(
    last ? `head differs from the last audit (${last.verdict})` : "no audit of this issue yet",
  );
}

/**
 * Resume point: whether a resumed run may go straight to the Reviewer. Only when the last Engineer
 * result in the run log is `ready` (the Engineer said the PR is built) and the head has no findings
 * open against it. Anything else means the Engineer has work, so the answer is to build.
 * The caller still runs the pre-review gate before any Reviewer is spawned.
 * @param {{ head: string, issue: string, events: Record<string, any>[], workpad?: string }} input
 */
export function resumePoint({ head, issue, events, workpad = "" }) {
  const lastEngineer = events.findLast(
    (e) => e.issue === issue && e.event === "result" && e.step === "engineer",
  );
  if (!lastEngineer) {
    return closed("no Engineer result in the run log for this issue; build first");
  }
  if (lastEngineer.outcome !== "ready") {
    return closed(`the last Engineer result was ${lastEngineer.outcome}; build first`);
  }
  const changed = headChanged({ head, issue, events, workpad });
  if (changed.code !== GATE_EXIT.open) {
    return changed;
  }
  return open(
    "the last Engineer result was ready and the head has no open findings; review it as it is",
  );
}

/**
 * Session-check: refuse a second run on one issue. Machine-agnostic: reads Linear state,
 * GitHub branches and PRs, and the central run log, never local worktrees.
 * @param {{
 *   issue: string, resume?: boolean, now?: number, liveMinutes?: number,
 *   linear: { state: string, labels: string[], blockedBy?: Array<{ identifier: string, state: string }> },
 *   branches: string[], openPrs: number[], events: Record<string, any>[], maxRunsPerDay?: number,
 * }} input
 */
export function sessionCheck({
  issue,
  resume = false,
  now = Date.now(),
  liveMinutes = 30,
  maxRunsPerDay = 3,
  linear,
  branches,
  openPrs,
  events,
}) {
  const hardStops = ["signal-up", "wontfix"];
  const label = linear.labels.find((l) => hardStops.includes(l));
  if (label) {
    return closed(`${issue} carries label ${label}`);
  }
  if (["Done", "Canceled", "Duplicate"].includes(linear.state)) {
    return closed(`${issue} is ${linear.state}`);
  }
  // The run cap holds on resume too: a resume is what a retrying orchestrator starts (KIT-295 ran
  // seven times in one night). Only runs that got past this check count, since `start` is logged after it.
  const startsToday = events.filter(
    (e) => e.issue === issue && e.event === "start" && now - Date.parse(e.at) < 24 * 3600_000,
  ).length;
  if (startsToday >= maxRunsPerDay) {
    return closed(
      `${issue} was started ${startsToday} times in the last 24 h (cap ${maxRunsPerDay}); a person raises flow.maxRunsPerDay in factory.config.json or waits`,
    );
  }
  // A blocker that is not Done or Canceled keeps any not-yet-finished issue out, in every state
  // except Blocked (which has its own rule below), also on resume.
  const unresolvedBlockers = (linear.blockedBy ?? []).filter(
    (b) => !["Done", "Canceled"].includes(b.state),
  );
  if (linear.state !== "Blocked" && unresolvedBlockers.length > 0) {
    return closed(
      `${issue} is blocked by ${unresolvedBlockers.map((b) => b.identifier).join(", ")}`,
    );
  }
  if (linear.state === "Blocked") {
    const unresolved = (linear.blockedBy ?? []).filter(
      (b) => !["Done", "Canceled"].includes(b.state),
    );
    if (unresolved.length > 0 || (linear.blockedBy ?? []).length === 0) {
      return closed(
        unresolved.length > 0
          ? `${issue} is blocked by ${unresolved.map((b) => b.identifier).join(", ")}`
          : `${issue} is Blocked with no blockedBy relation; a person is needed (Approval) or it is not blocked`,
      );
    }
    return open(`${issue} is Blocked but all blockers are resolved; move it to To-do first`);
  }
  const helpLabel = linear.labels.find((l) => ["needs-info", "ready-for-human"].includes(l));
  if (helpLabel) {
    // In To-do the label means the human answered (the card was moved there): the claim swaps it
    // back to ready-for-agent. Anywhere else (Approval, Backlog, Triage, a working stage) a person
    // is still needed.
    return linear.state === "To-do"
      ? open(
          `${issue} answered (${helpLabel} on To-do): swap ${helpLabel} ready-for-agent, resume from ### Waiting`,
        )
      : closed(`${issue} carries label ${helpLabel} (state ${linear.state})`);
  }
  if (resume) {
    return open(`${issue} resumed on purpose (state ${linear.state})`);
  }
  if (openPrs.length > 0) {
    return closed(
      `${issue} already has open PR ${openPrs.map((n) => `#${n}`).join(", ")}; use --resume to join it`,
    );
  }
  if (branches.length > 0) {
    return closed(`${issue} already has remote branch ${branches[0]}; use --resume to continue it`);
  }
  if (["In Progress", "In Review", "Approval", "Merging", "Post-Merge"].includes(linear.state)) {
    return closed(`${issue} is already ${linear.state} (claimed); use --resume to join it`);
  }
  const mine = events.filter((e) => e.issue === issue);
  const lastStart = mine.findLast((e) => e.event === "start" || e.event === "spawn");
  if (lastStart) {
    const age = (now - Date.parse(lastStart.at)) / 60000;
    const finished = mine.some(
      (e) => e.event === "result" && Date.parse(e.at) >= Date.parse(lastStart.at),
    );
    if (!finished && age < liveMinutes) {
      return closed(
        `${issue} was started ${Math.round(age)} min ago in the run log with no result`,
      );
    }
  }
  return open(`${issue} is free (state ${linear.state})`);
}

/**
 * Land gate: Done only when the PR SHA is on origin/<integration> AND the integration check
 * on the merge commit is green.
 * @param {{
 *   pr: { state: string, mergeCommit: string | null, headSha: string },
 *   onIntegration: boolean,
 *   checks: Array<{ name?: string, conclusion?: string }> | null,
 * }} input
 */
export function landGate({ pr, onIntegration, checks }) {
  if (pr.state !== "MERGED" || !pr.mergeCommit) {
    return closed(`PR is ${pr.state}, not merged`);
  }
  if (!onIntegration) {
    return {
      code: GATE_EXIT.waiting,
      line: `WAITING: merge commit ${pr.mergeCommit.slice(0, 7)} is not on origin/<integration> yet`,
    };
  }
  if (checks === null || checks.length === 0) {
    return {
      code: GATE_EXIT.waiting,
      line: `WAITING: no integration check reported on ${pr.mergeCommit.slice(0, 7)} yet`,
    };
  }
  if (checks.some((c) => !c.conclusion)) {
    return {
      code: GATE_EXIT.waiting,
      line: `WAITING: integration checks still running on ${pr.mergeCommit.slice(0, 7)}`,
    };
  }
  if (!requiredChecksGreen(checks)) {
    const bad = checks
      .filter((c) => !["success", "skipped", "neutral"].includes(c.conclusion))
      .map((c) => c.name);
    return closed(`integration check red on ${pr.mergeCommit.slice(0, 7)}: ${bad.join(", ")}`);
  }
  return open(
    `PR head ${pr.headSha.slice(0, 7)} is on origin/<integration> as ${pr.mergeCommit.slice(0, 7)}, integration check green; Done is allowed`,
  );
}

/**
 * The generic result line of a step (LEAD-RESULT, ENGINEER-RESULT: free trailing sentence): the LAST
 * NON-EMPTY line of its output must be `<TAG> KIT-n <outcome> ...`. AUDIT-RESULT has its own exact
 * grammar in audit-result.mjs. Nothing may follow it: a line quoted earlier, or a caveat written
 * after a green line, must not decide the verdict. A line wrapped whole in `**...**` or backticks
 * is accepted; a wrapper around only part of the line is not.
 * @param {string} tag e.g. LEAD-RESULT
 * @param {string} text
 * @returns {{ issue: string, outcome: string, rest: string } | null}
 */
export function parseResultLine(tag, text) {
  const m = new RegExp(`^${tag} ([A-Z][A-Z0-9]*-\\d+) (\\S+)(?: (.*))?$`).exec(lastLine(text));
  return m ? { issue: m[1], outcome: m[2], rest: m[3] ?? "" } : null;
}

/**
 * Review gate: folds the steps into one verdict. A step is `{ name, code, line }` with
 * wait-for-checks style codes (0 ok, 1 red, 2 pending, 3 not mergeable, 4 unknown, 5 gh unusable) except the
 * mechanical steps, which use 0 ok and anything else red.
 * @param {{ name: string, code: number, line: string }[]} steps
 */
export function foldReview(steps) {
  const bad = steps.filter((s) => s.code !== 0);
  if (bad.length === 0) {
    return {
      code: GATE_EXIT.open,
      line: `OPEN (review): ${steps.map((s) => s.name).join(", ")} clean`,
    };
  }
  const [first] = bad;
  const more =
    bad.length > 1
      ? ` (+${bad.length - 1} more: ${bad
          .slice(1)
          .map((s) => s.name)
          .join(", ")})`
      : "";
  const code =
    first.name === "checks" && first.code === 2
      ? GATE_EXIT.waiting
      : first.name === "checks" && (first.code === 4 || first.code === 5)
        ? GATE_EXIT.unknown
        : GATE_EXIT.closed;
  const word =
    code === GATE_EXIT.closed ? "CLOSED" : code === GATE_EXIT.waiting ? "WAITING" : "UNKNOWN";
  return { code, line: `${word} (review): ${first.name}: ${first.line}${more}` };
}

/**
 * Env for check-pr-write-scope that carries the PR's own text, so the script never infers the PR
 * from the checkout's branch. PR_BODY must be non-empty or the script falls back to inference.
 * @param {{ title?: string, body?: string, headRefName?: string }} view
 */
export function scopeEnv(view) {
  return {
    PR_TITLE: view.title ?? "",
    PR_BODY: view.body?.trim() ? view.body : " ",
    PR_HEAD_REF: view.headRefName ?? "",
  };
}

/** Whether the PR text declares a `write-scope:` line. */
export function declaresScope(view) {
  const globs = parseWriteScopeGlobs(
    [view.title, view.body, view.headRefName].filter(Boolean).join("\n"),
  );
  return Array.isArray(globs) && globs.length > 0;
}

/**
 * Where the write-scope comes from. The PR text wins; when it has none, the Linear issue's own
 * `write-scope:` line stands in, so the scope step still runs. An issue that declares a scope
 * while the PR text does not is a `scope-missing-in-pr` failure: CI's scope ratchet reads only
 * the PR text and would skip silently.
 * @param {{ title?: string, body?: string, headRefName?: string }} view
 * @param {string | null | undefined} issueDescription the Linear issue description
 * @returns {{ source: "pr" | "issue" | "none", globs: string[],
 *   env: Record<string, string>, problem: string | null }}
 */
export function scopeSource(view, issueDescription) {
  const prText = [view.title, view.body, view.headRefName].filter(Boolean).join("\n");
  const inPr = parseWriteScopeGlobs(prText) ?? [];
  if (inPr.length > 0) {
    return { source: "pr", globs: inPr, env: scopeEnv(view), problem: null };
  }
  const inIssue = parseWriteScopeGlobs(String(issueDescription ?? "")) ?? [];
  if (inIssue.length > 0) {
    return {
      source: "issue",
      globs: inIssue,
      env: { WRITE_SCOPE: inIssue.join(", ") },
      problem: `scope-missing-in-pr: the issue declares write-scope ${inIssue.join(", ")} but the PR body has no write-scope: line; add it so CI's scope ratchet runs`,
    };
  }
  return { source: "none", globs: [], env: scopeEnv(view), problem: null };
}

/**
 * Whether the workpad already holds a `### Plan` section (a heading line, not a mention). A
 * resume skips the Lead then, so the plan the Engineer built against is not overwritten.
 * @param {string} workpad
 */
export function workpadHasPlan(workpad) {
  return /^### Plan[ \t]*$/m.test(workpad ?? "");
}

/** Below this many seconds of budget a wait cannot finish a poll, so the gate answers waiting at once. */
export const MIN_WAIT_SECONDS = 30;

/**
 * What is left of a gate call's total `--timeout` for waiting on checks, after the mechanical
 * steps took `elapsedMs`; null when too little remains (the gate then reports waiting).
 * @param {string | number} totalSeconds
 * @param {number} elapsedMs
 * @returns {number | null}
 */
export function remainingWaitSeconds(totalSeconds, elapsedMs) {
  const left = Math.floor(Number(totalSeconds) - elapsedMs / 1000);
  return Number.isFinite(left) && left >= MIN_WAIT_SECONDS ? left : null;
}

/** The commit status a slice's Device flow run sets on the PR head (ADR-0048, ADR-0059). */
export const DEVICE_FLOWS_CONTEXT = "Device flows";
/** The PR label that starts the hosted Device flows run (.github/workflows/device-flows.yml). */
export const DEVICE_FLOWS_LABEL = "run-device-flows";

/** Path of an issue's slice flow, the file whose presence makes the status part of the gate. */
export function sliceFlowPath(issue) {
  return `apps/mobile/.maestro/slices/${issue}.yaml`;
}

/**
 * What the `Device flows` statuses of a head say, newest first. `error` is not a verdict (the run
 * stopped before the flow finished), so it is asked for again once; a head with a second `error`
 * (`no-verdict`) has had its re-request and still has no verdict (ADR-0059 "Not settled"): only a
 * person on the Mac can give it one.
 * @param {Array<{ context?: string, state?: string }>} statuses
 * @returns {"none" | "pending" | "green" | "red" | "error" | "no-verdict"}
 */
export function deviceFlowsState(statuses) {
  const own = statuses.filter((status) => status.context === DEVICE_FLOWS_CONTEXT);
  const latest = own[0]?.state;
  if (latest === undefined) return "none";
  if (latest === "success") return "green";
  if (latest === "failure") return "red";
  if (latest === "error") {
    return own.filter((status) => status.state === "error").length >= 2 ? "no-verdict" : "error";
  }
  return "pending";
}

/** The ending of a run that cannot get a Device flows verdict (the sentence has no `?`: a decision, not a question). */
export function deviceFlowsNoVerdictSentence(head) {
  return `needs-human: run device-run.sh on the Mac on ${String(head).slice(0, 7)}`;
}

/**
 * Whether to ask for a hosted Device flows run on a PR head. Statuses are GitHub's commit
 * statuses for the head, newest first. A run is asked for only when the slice has a flow and the
 * head has no verdict and no run under way: a green or running head is left alone (a macOS run
 * is not free), and a red one is the Engineer's to fix with a new commit, which is a new head.
 * `error` is not a verdict: the run stopped before the flow finished (a timeout, a runner fault),
 * so it is asked for again, once. A second `error` on the same head is `no-verdict`: nothing more
 * is asked for and the run ends `blocked needs-human`.
 * @param {{ hasSliceFlow: boolean, statuses: Array<{ context?: string, state?: string }> }} input
 * @returns {{ request: boolean, line: string }}
 */
export function deviceFlowsRequest({ hasSliceFlow, statuses }) {
  if (!hasSliceFlow) {
    return { request: false, line: "NOT NEEDED: this PR has no slice flow for the issue" };
  }
  const latest = statuses.find((status) => status.context === DEVICE_FLOWS_CONTEXT);
  if (!latest) {
    return { request: true, line: `REQUESTED: no ${DEVICE_FLOWS_CONTEXT} status on the head yet` };
  }
  if (deviceFlowsState(statuses) === "no-verdict") {
    return {
      request: false,
      line: `NO VERDICT: the ${DEVICE_FLOWS_CONTEXT} run stopped before the flow finished again after a re-request; run device-run.sh on the Mac`,
    };
  }
  if (latest.state === "error") {
    return {
      request: true,
      line: `REQUESTED AGAIN: the last ${DEVICE_FLOWS_CONTEXT} run stopped before the flow finished`,
    };
  }
  return {
    request: false,
    line: `ALREADY ${String(latest.state).toUpperCase()}: the head has a ${DEVICE_FLOWS_CONTEXT} status`,
  };
}

/** Names after the `): ` of a wait-for-checks `RED (...)`/`PENDING (...)` line (also behind `TIMEOUT after Ns: `). */
function checkNames(line, word) {
  const m = new RegExp(`${word} \\([^)]*\\): (.*)$`).exec(line);
  return m ? m[1].split(", ").map((name) => name.trim()) : [];
}

/**
 * Folds the Device flows statuses of the head into the `checks` step of a pre-review gate that
 * waited for them (ADR-0059). `wait-for-checks` buckets a commit status `error` as red, which
 * would close the gate and spend a fix round on a run no Engineer can fix, and a status that is
 * still pending when the budget runs out looks like any other pending check. So, only when
 * `Device flows` is the sole red or sole pending check:
 *   - `error` once: waiting (the run is asked for again; no fix round);
 *   - `no-verdict`: closed with `device-flows-no-verdict`, which ends `blocked needs-human`;
 *   - still pending: waiting, tagged `device-flows-pending`, so an exhausted wait ends
 *     `blocked needs-human` instead of `ci-pending`.
 * A red flow (`failure`), any other red or pending check, and a green head pass through unchanged.
 * @param {{ code: number, line: string }} checks the `wait-for-checks` result
 * @param {Array<{ context?: string, state?: string }>} statuses
 * @param {string} head
 */
export function deviceFlowsStep(checks, statuses, head) {
  const sha = String(head).slice(0, 7);
  const state = deviceFlowsState(statuses);
  const only = (names) => names.length === 1 && names[0] === DEVICE_FLOWS_CONTEXT;
  if (checks.code === 1 && only(checkNames(checks.line, "RED"))) {
    if (state === "no-verdict") {
      return {
        code: 1,
        line: `${checks.line}; device-flows-no-verdict: ${deviceFlowsNoVerdictSentence(head)}`,
      };
    }
    if (state === "error") {
      return {
        code: 2,
        line: `PENDING: ${DEVICE_FLOWS_CONTEXT} stopped before the flow finished on ${sha}; asked for again`,
      };
    }
  }
  if (checks.code === 2 && only(checkNames(checks.line, "PENDING"))) {
    return { code: 2, line: `${checks.line}; device-flows-pending on ${sha}` };
  }
  return checks;
}

/** A waiting gate result (exit 3) is never written to the run log: only open or closed is an outcome. */
export function shouldLogGate(result) {
  return result.code !== GATE_EXIT.waiting;
}
