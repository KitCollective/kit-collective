/**
 * Pure decisions behind `scripts/auto-land.mjs` (ADR-0061). Every function takes what it needs as
 * data and returns either `null` (the condition holds) or a refusal `{ code, line }`; the CLI
 * gathers the data from GitHub, git, Linear and the run log, runs these in the documented order
 * and stops at the first refusal. Nothing here reads a result relayed by a model.
 */

import { blockerIsResolved } from "./land-policy.mjs";
import { isCompanionPath, matchesGlob, parseWriteScopeGlobs } from "./pr-write-scope.mjs";
import { HIGH_RISK_GLOBS, startDecision } from "./start-decision.mjs";

/** A runaway guard, not a throttle: starts per 24 h. `flow.autoLand.maxPerDay` of factory.config.json overrides it. */
export const DEFAULT_MAX_PER_DAY = 100;
/** The circuit breaker opens after this many consecutive failures. `flow.autoLand.breakerAfter` overrides it. */
export const DEFAULT_BREAKER_AFTER = 3;
/**
 * A runaway guard, not a review budget: a diff of more lines than this (added plus deleted) is for a
 * person. A whole UI slice with its tests is 800 to 3,000 lines, so 400 sent nearly every slice to
 * Approval (ADR-0064). A binary file counts as BINARY_LINES.
 */
export const MAX_DIFF_LINES = 4000;
/** What one binary file adds to the diff size. */
export const BINARY_LINES = 400;
/** Total budget of one `start` call, under the 600 s foreground cap of a claude-code thread. */
export const START_BUDGET_SECONDS = 480;
/** Kept back from the gate's wait for the lock, sync, Linear and enqueue steps that follow it. */
export const START_RESERVE_SECONDS = 60;
/** The kill-switch file, relative to the main checkout. */
export const KILL_FILE = ".factory/auto-land.off";

/** Labels that mean a person is needed or the issue is out of play, on top of `hold`. */
export const STOP_LABELS = ["signal-up", "wontfix", "needs-info", "ready-for-human"];

/**
 * Paths of the factory's own enforcement and runtime. A PR that edits the thing that decides
 * whether a PR may land is never landed by that thing.
 */
export const FACTORY_GUARD_GLOBS = [
  ".bb/**",
  ".factory/**",
  ".github/**",
  "factory.config.json",
  "scripts/auto-land.mjs",
  "scripts/gate.mjs",
  "scripts/audit-receipt.mjs",
  "scripts/merge-lock.mjs",
  "scripts/sync-pr.mjs",
  "scripts/lib/auto-land.mjs",
  "scripts/lib/gates.mjs",
  "scripts/lib/gate-io.mjs",
  "scripts/lib/land-policy.mjs",
  "scripts/lib/audit-receipt.mjs",
  "scripts/lib/audit-result.mjs",
  "scripts/lib/merge-lock.mjs",
  "scripts/lib/sync-pr.mjs",
  "scripts/lib/run-log.mjs",
  "scripts/lib/start-decision.mjs",
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  "**/*.pem",
];

const refuse = (code, detail) => ({ code, line: `REFUSED (auto-land): ${code}: ${detail}` });
const short = (sha) => String(sha ?? "").slice(0, 7);

/** Max starts per 24 h: the config value when it is a positive integer, else the constant. */
export function maxPerDay(config) {
  const value = config?.flow?.autoLand?.maxPerDay;
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_PER_DAY;
}

/** Consecutive failures that open the breaker: the config value when it is a positive integer, else the constant. */
export function breakerAfter(config) {
  const value = config?.flow?.autoLand?.breakerAfter;
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_BREAKER_AFTER;
}

/**
 * The circuit breaker, read from the run log. Outcomes of `auto-land` in order: `landed` is a success and
 * resets the count, `alarm` (an ejected PR, red integration CI, a failed enqueue: a person was asked) is a
 * failure, `breaker-reset` clears it. Open when the last `after` outcomes are failures.
 * @param {Array<Record<string, any>>} events
 * @param {number} after
 */
export function breaker(events, after) {
  let failures = 0;
  for (const e of events.filter((x) => x.event === "auto-land").reverse()) {
    if (e.outcome === "alarm") {
      failures += 1;
    } else if (e.outcome === "landed" || e.outcome === "breaker-reset") {
      break;
    }
  }
  return failures >= after
    ? refuse(
        "breaker-open",
        `the last ${failures} auto-land finishes failed; fix the cause, then a person runs: node scripts/auto-land.mjs reset`,
      )
    : null;
}

/**
 * (a) The kill switch, three ways: the `hold` label, the file `.factory/auto-land.off` in the
 * main checkout, and `flow.autoLand.enabled` false without the workflow's `--force-enabled`.
 * The file and the label win over `--force-enabled`.
 * @param {{ labels: string[], killFile: boolean, enabled: boolean, forceEnabled: boolean }} o
 */
export function killSwitch({ labels, killFile, enabled, forceEnabled }) {
  if (killFile) {
    return refuse(
      "kill-switch",
      `${KILL_FILE} exists in the main checkout (delete it to turn auto-land on)`,
    );
  }
  if (labels.some((label) => label.toLowerCase() === "hold")) {
    return refuse("kill-switch", "the issue carries the label hold");
  }
  if (!enabled && !forceEnabled) {
    return refuse(
      "kill-switch",
      "flow.autoLand.enabled is false and no --force-enabled was passed",
    );
  }
  return null;
}

/**
 * (b) The PR itself. `head` is the checkout's HEAD; the PR's head comes from GitHub.
 * Being behind the lane is no refusal: the merge queue integrates the head with the newest base and tests
 * the combined state (the caller trial-merges for conflicts).
 * @param {{ view: Record<string, any>, head: string, lane: string, dirty: boolean }} o
 * @returns {{ code: string, line: string, waiting?: boolean } | null}
 */
export function prReadiness({ view, head, lane, dirty }) {
  if (view.state !== "OPEN") {
    return refuse("pr-not-ready", `the PR is ${view.state}, not open`);
  }
  if (view.isDraft) {
    return refuse("pr-not-ready", "the PR is a draft");
  }
  if (view.isCrossRepository || view.baseRefName !== lane) {
    return refuse("pr-not-ready", `the PR is from another repository or not into ${lane}`);
  }
  if (!/^[0-9a-f]{40}$/i.test(view.headRefOid ?? "") || !/^[0-9a-f]{40}$/i.test(head ?? "")) {
    return refuse("head-mismatch", "cannot read the checkout head or the PR head");
  }
  if (view.headRefOid.toLowerCase() !== head.toLowerCase()) {
    return refuse(
      "head-mismatch",
      `the checkout is at ${short(head)}, the PR head is ${short(view.headRefOid)}; run from the PR's worktree`,
    );
  }
  if (dirty) {
    return refuse("head-mismatch", "the checkout has uncommitted changes");
  }
  if (view.autoMergeRequest) {
    return refuse("pr-not-ready", "auto-merge is already enabled on the PR");
  }
  if (view.mergeable === "UNKNOWN") {
    return { ...refuse("pr-not-ready", "GitHub has not computed mergeability yet"), waiting: true };
  }
  if (view.mergeable !== "MERGEABLE") {
    return refuse("pr-not-ready", `the PR is ${view.mergeable}`);
  }
  return null;
}

/**
 * (c) The issue: In Review, no stop label, no unresolved blockedBy. `Approval` is never taken:
 * it means a person has to act.
 * @param {{ state: string, labels: string[], blockedBy?: Array<{ identifier: string, state: string }> }} linear
 */
export function issueReadiness(linear) {
  if (linear.state !== "In Review") {
    return refuse(
      "issue-not-ready",
      `the issue is ${linear.state}; auto-land starts from In Review`,
    );
  }
  const stop = linear.labels.find((label) => STOP_LABELS.includes(label.toLowerCase()));
  if (stop) {
    return refuse("hold-label", `the issue carries the label ${stop}`);
  }
  const open = (linear.blockedBy ?? []).filter((b) => !blockerIsResolved(b.state));
  if (open.length > 0) {
    return refuse(
      "blocked-by",
      `the issue is blocked by ${open.map((b) => b.identifier).join(", ")}`,
    );
  }
  return null;
}

/**
 * (d) Risk class. Anything `start-decision` calls high-risk, a mobile issue without
 * `no-device-needed`, a diff over the line cap, and a diff touching a path outside the issue's
 * write-scope (or none declared) all go to a person.
 * @param {{
 *   description: string, labels: string[], files: string[], lines: number,
 *   scope?: string[], maxLines?: number,
 * }} o `files` and `lines` are the PR's merge-base diff
 */
export function riskClass({ description, labels, files, lines, issue, maxLines = MAX_DIFF_LINES }) {
  const decision = startDecision({ body: description, labels });
  if (decision.highRisk) {
    return refuse(
      "needs-human",
      "the issue's write-scope touches schema, auth, IAP or workflows (high risk)",
    );
  }
  const risky = files.find((file) =>
    [...HIGH_RISK_GLOBS, ...FACTORY_GUARD_GLOBS].some((g) => matchesGlob(file, g)),
  );
  if (risky) {
    return refuse("needs-human", `the diff touches ${risky}, a high-risk or factory path`);
  }
  const lower = labels.map((label) => label.toLowerCase());
  // A slice flow in the diff makes the hosted `Device flows` status part of the review gate
  // (ADR-0059), so the device check is a machine's, not a person's (ADR-0064).
  const sliceFlow = `apps/mobile/.maestro/slices/${issue}.yaml`;
  if (
    lower.includes("surface:mobile") &&
    !lower.includes("no-device-needed") &&
    !(issue && files.includes(sliceFlow))
  ) {
    return refuse(
      "needs-human",
      `the issue is surface:mobile with neither a slice flow (${sliceFlow}) nor no-device-needed`,
    );
  }
  if (lines > maxLines) {
    return refuse("oversize-diff", `the diff changes ${lines} lines, the cap is ${maxLines}`);
  }
  const scope = parseWriteScopeGlobs(String(description ?? "")) ?? [];
  if (scope.length === 0) {
    return refuse(
      "out-of-scope",
      "the issue declares no write-scope, so the diff cannot be bounded",
    );
  }
  const outside = files.filter(
    (file) => !scope.some((glob) => matchesGlob(file, glob)) && !isCompanionPath(file, issue),
  );
  if (outside.length > 0) {
    return refuse(
      "out-of-scope",
      `${outside.slice(0, 3).join(", ")}${outside.length > 3 ? ` (+${outside.length - 3} more)` : ""} is outside write-scope ${scope.join(", ")}`,
    );
  }
  return null;
}

/**
 * The newest run of each check, by start time. GitHub keeps every run of a check on a commit: a
 * push that starts two CI runs gets the first cancelled, and its `test` job ends as a failure next
 * to the green one (KIT-365, 2026-10-17: refused as pr-not-ready with the newest run green).
 * @param {Array<{ name: string, conclusion: string | null, started_at?: string, id?: number }>} runs
 */
/**
 * The check runs that judge the PR: those of a check suite a workflow_dispatch run made are left out.
 * A dispatched run is a manual one (the regression flows on request), not the PR's own gate: KIT-284
 * on 2026-10-18 was refused on a dispatched Device flows run that failed two seconds after the PR's
 * own run had passed.
 */
export function prCheckRuns(runs, dispatchedSuites) {
  const skip = new Set((dispatchedSuites ?? []).map(Number));
  return (Array.isArray(runs) ? runs : []).filter((run) => !skip.has(Number(run?.check_suite?.id)));
}

export function latestCheckRuns(runs) {
  const newest = new Map();
  for (const run of Array.isArray(runs) ? runs : []) {
    const seen = newest.get(run.name);
    const key = (r) => [String(r.started_at ?? ""), Number(r.id ?? 0)];
    const [at, id] = key(run);
    if (!seen || at > key(seen)[0] || (at === key(seen)[0] && id > key(seen)[1])) {
      newest.set(run.name, run);
    }
  }
  return [...newest.values()].map(({ name, conclusion }) => ({ name, conclusion }));
}

/** Added plus deleted lines of `git diff --numstat` output; a binary file counts as `binaryLines`. */
export function diffLines(numstat, binaryLines = BINARY_LINES) {
  let total = 0;
  for (const row of String(numstat ?? "").split("\n")) {
    const m = /^(\d+|-)\t(\d+|-)\t/.exec(row);
    if (m) {
      total += m[1] === "-" ? binaryLines : Number(m[1]) + Number(m[2]);
    }
  }
  return total;
}

const norm = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

/**
 * (e, first half) An independent reviewer exists in the run log: the issue has a `spawn reviewer`
 * with thread, provider and model, and no engineer spawn of the issue ran on that provider and
 * model. The reviewer chosen is the issue's most recent one.
 * @param {Array<Record<string, any>>} events
 * @param {string} issue
 * @returns {{ reviewer: Record<string, any>, engineerThread: string } | { code: string, line: string }}
 */
export function independentReviewer(events, issue) {
  const spawns = events.filter((e) => e.event === "spawn" && e.issue === issue);
  const reviewer = spawns.findLast((e) => e.step === "reviewer" && e.thread);
  if (!reviewer) {
    return refuse(
      "no-independent-reviewer",
      `the run log has no spawn reviewer with a thread for ${issue}`,
    );
  }
  const engineers = spawns.filter((e) => e.step === "engineer");
  if (engineers.length === 0 || engineers.some((e) => !e.provider || !e.model)) {
    return refuse(
      "no-independent-reviewer",
      "provider and model are not logged for every engineer spawn",
    );
  }
  if (!reviewer.provider || !reviewer.model) {
    return refuse("no-independent-reviewer", "provider and model are not logged for the reviewer");
  }
  if (engineers.some((e) => e.thread === reviewer.thread)) {
    return refuse("same-model-reviewer", `thread ${reviewer.thread} is an engineer thread`);
  }
  const same = engineers.find(
    (e) => norm(e.provider) === norm(reviewer.provider) && norm(e.model) === norm(reviewer.model),
  );
  if (same) {
    return refuse(
      "same-model-reviewer",
      `the reviewer runs on ${reviewer.provider}/${reviewer.model}, the same as an engineer spawn`,
    );
  }
  return { reviewer, engineerThread: engineers.findLast((e) => e.thread)?.thread ?? "" };
}

/** The audit event for exactly this head: the issue's last audit, green, on a sha that starts the head. */
export function greenAuditFor(events, issue, head) {
  const last = events.findLast((e) => e.event === "audit" && e.issue === issue);
  return Boolean(
    last && last.verdict === "green" && last.sha && norm(head).startsWith(norm(last.sha)),
  );
}

/**
 * Maps a receipt refusal line to a reason: an audit of another head, or of a thread older than the
 * head, is a stale audit; everything else is a refused receipt.
 */
export function receiptRefusal(line) {
  return /audited [0-9a-f]+, the head is|started before the head commit/.test(line)
    ? refuse("stale-audit", line.replace(/^REFUSED \(receipt\): /, ""))
    : refuse("receipt-refused", line);
}

/** (g) Starts in the last 24 hours: `auto-land` events with outcome `start`. */
export function startsInLastDay(events, now = Date.now()) {
  return events.filter(
    (e) =>
      e.event === "auto-land" && e.outcome === "start" && now - Date.parse(e.at) < 24 * 3600 * 1000,
  ).length;
}

export function dailyCap(events, cap, now = Date.now()) {
  const used = startsInLastDay(events, now);
  return used >= cap
    ? refuse(
        "daily-cap",
        `${used} auto-land starts in the last 24 h, the runaway ceiling is ${cap}`,
      )
    : null;
}

/** The role comment on the issue when auto-land sets Merging. */
export function approvalComment(conditions) {
  return `Auto-approved: ${conditions.join("; ")}`;
}

/**
 * `finish`: what a poll of the PR means.
 * @param {{ state: string, mergeCommit?: { oid?: string } | null, autoMergeRequest?: unknown, isInMergeQueue?: boolean }} view
 * @returns {"merged" | "closed" | "queued" | "not-queued"}
 */
export function queueState(view) {
  if (view.state === "MERGED") {
    return "merged";
  }
  if (view.state === "CLOSED") {
    return "closed";
  }
  return view.autoMergeRequest || view.isInMergeQueue ? "queued" : "not-queued";
}
