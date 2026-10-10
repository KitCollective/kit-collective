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
 * Session-check: refuse a second run on one issue. Machine-agnostic: reads Linear state,
 * GitHub branches and PRs, and the central run log, never local worktrees.
 * @param {{
 *   issue: string, resume?: boolean, now?: number, liveMinutes?: number,
 *   linear: { state: string, labels: string[] },
 *   branches: string[], openPrs: number[], events: Record<string, any>[],
 * }} input
 */
export function sessionCheck({
  issue,
  resume = false,
  now = Date.now(),
  liveMinutes = 30,
  linear,
  branches,
  openPrs,
  events,
}) {
  const blockedLabels = ["signal-up", "ready-for-human", "needs-info", "wontfix"];
  const label = linear.labels.find((l) => blockedLabels.includes(l));
  if (label) {
    return closed(`${issue} carries label ${label}`);
  }
  if (["Done", "Canceled", "Duplicate"].includes(linear.state)) {
    return closed(`${issue} is ${linear.state}`);
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
  if (["Implementing", "In Review", "Ready for merge", "Merging"].includes(linear.state)) {
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
 * wait-for-checks style codes (0 ok, 1 red, 2 pending, 3 not mergeable, 4 unknown) except the
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
      : first.name === "checks" && first.code === 4
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
