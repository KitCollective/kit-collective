/**
 * Central run log of the factory flow (ADR-0052). One JSON line per event, appended only by the
 * orchestrator thread: workers run on several machines, so a per-checkout log would split.
 * Every value is validated against a fixed shape: no free text and no secrets can reach the file.
 * Pattern from Optio's decide/runlog.mjs, rewritten for this repo (see .cursor/skills/NOTICE.md).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { ROW_IDS } from "./audit-result.mjs";
import { LOCK_ROWS } from "./review-matrix.mjs";

export const DEFAULT_LOG_PATH = ".factory/run-log.jsonl";

export const EVENTS = [
  "start",
  "spawn",
  "result",
  "gate",
  "audit",
  "reason",
  "auto-land",
  "holdout",
];
/** `scenario-judge` is the Milestone scenarios workflow's Scenario judge (KIT-353): flow writer and run judge. */
export const STEPS = ["lead", "engineer", "reviewer", "lander", "scenario-judge"];
export const MODES = ["start", "replan", "fix", "review"];
export const OUTCOMES = [
  "plan",
  "plan-approval",
  "stop",
  "ready",
  "blocked",
  "failed",
  "green",
  "amber",
  "red",
  "merged",
  "landed",
  "none",
  // The Scenario judge (KIT-353): a flow written or not, a run satisfied or not, a milestone met or not.
  "written",
  "cannot",
  "satisfied",
  "not-satisfied",
  "met",
  "not-met",
];
export const GATES = ["review", "pre-review", "land", "session", "head", "scope", "checks"];
export const GATE_OUTCOMES = ["open", "closed"];
/** What `scripts/auto-land.mjs` logs (ADR-0061): `start` is an enqueue and is what the daily cap counts. */
export const AUTO_LAND_OUTCOMES = ["start", "landed", "refused", "alarm", "breaker-reset"];

/** Fixed reason codes. A row that failed an audit is `row-<lock row id>`. */
export const REASON_CODES = [
  ...LOCK_ROWS.map((row) => `row-${row.id}`),
  "blocked-by",
  "gate-closed",
  "needs-human",
  "blind-alley",
  "no-linear-tools",
  "tool-refused",
  "evidence-gap",
  "no-result-line",
  "runner-no-result",
  "report-failed",
  "lead-skipped",
  "engineer-skipped",
  "ci-red",
  "ci-pending",
  "device-flows-no-verdict",
  "replan",
  "conflict",
  "scope-miss",
  "scope-missing-in-pr",
  "session-limit",
  "kill-switch",
  "head-mismatch",
  "pr-not-ready",
  "issue-not-ready",
  "hold-label",
  "oversize-diff",
  "out-of-scope",
  "no-independent-reviewer",
  "same-model-reviewer",
  "stale-audit",
  "receipt-refused",
  "review-gate-closed",
  "daily-cap",
  "breaker-open",
  "sync-changed-head",
  "lock-held",
  "enqueue-failed",
  "queue-ejected",
  "integration-red",
  "land-gate-closed",
  "holdout-read",
  // Milestone scenarios (KIT-353). Every `scenarios.mjs status --code` (ERROR_CODES in
  // scripts/lib/scenarios.mjs) is here too, so the workflow's `reason` line for it is never refused;
  // a test reads the workflow's list. `scenarios-refused` is a refused check, `status-failed` an
  // error status that could not be posted.
  "scenarios-refused",
  "status-failed",
  "stopped",
  "bad-command",
  "github-unreachable",
  "hosted-run-error",
  "development-moved",
  "flow-not-written",
  "producer-failed",
  "dispatch-failed",
  "judge-no-result",
  "wait-exhausted",
  "bad-answer",
  "unspecified",
];

const ISSUE = /^[A-Z][A-Z0-9]*-\d+$/;
const THREAD = /^thr_[a-z0-9]{4,32}$/;
const WORD = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,59}$/;
/** `<project-slug>/<milestone-slug>.md`, the Holdout file a read named (ADR-0060). */
const HOLDOUT_FILE = /^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*\.md$/;
/** `<project-slug>/<milestone-slug>`: the milestone a Milestone scenarios event belongs to (its Holdout file without `.md`). */
const MILESTONE = /^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/;
const SHA = /^[0-9a-f]{7,40}$/;
const TOKENS = (v) => v === null || (Number.isInteger(v) && v >= 0);

/** key -> validator. A key outside this table is refused, so nothing unvetted is written. */
const FIELDS = {
  issue: (v) => typeof v === "string" && ISSUE.test(v),
  milestone: (v) => typeof v === "string" && MILESTONE.test(v),
  step: (v) => STEPS.includes(v),
  mode: (v) => MODES.includes(v),
  thread: (v) => typeof v === "string" && THREAD.test(v),
  provider: (v) => typeof v === "string" && WORD.test(v),
  model: (v) => typeof v === "string" && WORD.test(v),
  machine: (v) => typeof v === "string" && WORD.test(v),
  tokensIn: TOKENS,
  tokensOut: TOKENS,
  outcome: (v) =>
    OUTCOMES.includes(v) || GATE_OUTCOMES.includes(v) || AUTO_LAND_OUTCOMES.includes(v),
  gate: (v) => GATES.includes(v),
  verdict: (v) => ["green", "amber", "red"].includes(v),
  round: (v) => Number.isInteger(v) && v >= 0 && v < 100,
  sha: (v) => typeof v === "string" && SHA.test(v),
  rows: (v) => Array.isArray(v) && v.length <= 20 && v.every((r) => ROW_IDS.includes(r)),
  code: (v) => REASON_CODES.includes(v),
  holdout: (v) => typeof v === "string" && HOLDOUT_FILE.test(v),
};

/** Events a milestone run writes: for these `milestone` stands in for `issue` (exactly one of the two). */
const MILESTONE_EVENTS = ["start", "spawn", "result", "reason"];

/** Fields each event requires; `gate` also takes an `outcome` of open or closed. */
const REQUIRED = {
  start: ["issue"],
  spawn: ["issue", "step"],
  result: ["issue", "step", "outcome"],
  gate: ["issue", "gate", "outcome"],
  audit: ["issue", "verdict", "round", "sha"],
  reason: ["issue", "code"],
  "auto-land": ["issue", "outcome"],
  holdout: ["code", "holdout"],
};

/**
 * @param {Record<string, unknown>} event
 * @returns {string[]} problems; empty when the event may be written
 */
export function validateEvent(event) {
  const problems = [];
  if (!EVENTS.includes(event?.event)) {
    return [`event must be one of ${EVENTS.join(", ")}`];
  }
  const byMilestone = MILESTONE_EVENTS.includes(event.event);
  for (const key of REQUIRED[event.event]) {
    if (key === "issue" && byMilestone) {
      if (event.issue === undefined && event.milestone === undefined) {
        problems.push(`${event.event} needs issue or milestone`);
      } else if (event.issue !== undefined && event.milestone !== undefined) {
        problems.push(`${event.event} takes issue or milestone, not both`);
      }
      continue;
    }
    // A breaker reset belongs to no issue.
    if (event[key] === undefined && !(event.outcome === "breaker-reset" && key === "issue")) {
      problems.push(`${event.event} needs ${key}`);
    }
  }
  if (!byMilestone && event.milestone !== undefined) {
    problems.push(`${event.event} takes no milestone`);
  }
  for (const [key, value] of Object.entries(event)) {
    if (key === "event" || key === "at") {
      continue;
    }
    if (!FIELDS[key]) {
      problems.push(`unknown field ${key}`);
    } else if (!FIELDS[key](value)) {
      problems.push(`invalid ${key}`);
    }
  }
  // The receipt reads provider and model from these spawns, so an engineer or reviewer spawn
  // without them (or without a thread) would let a check be bypassed. Only the lead may omit them.
  if (event.event === "spawn" && ["engineer", "reviewer"].includes(event.step)) {
    for (const key of ["thread", "provider", "model"]) {
      if (event[key] === undefined) {
        problems.push(`spawn ${event.step} needs ${key}`);
      }
    }
  }
  if (event.event === "gate" && !GATE_OUTCOMES.includes(event.outcome)) {
    problems.push("gate outcome must be open or closed");
  }
  if (event.event === "auto-land" && !AUTO_LAND_OUTCOMES.includes(event.outcome)) {
    problems.push(`auto-land outcome must be one of ${AUTO_LAND_OUTCOMES.join(", ")}`);
  }
  return problems;
}

/**
 * The main checkout's directory, shared by every worktree of this clone.
 * @param {string} cwd
 */
export function mainCheckout(cwd = process.cwd()) {
  const common = execFileSync(
    "git",
    ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  ).trim();
  return dirname(common);
}

/**
 * Where the log lives: `KC_RUN_LOG`, else `flow.runLog` of factory.config.json, else the default,
 * relative to the main checkout (gitignored `.factory/`).
 * @param {{ cwd?: string, env?: Record<string, string | undefined>, config?: { flow?: { runLog?: string } } }} [options]
 */
export function logPath({ cwd = process.cwd(), env = process.env, config } = {}) {
  if (env.KC_RUN_LOG) {
    return env.KC_RUN_LOG;
  }
  let configured = config?.flow?.runLog;
  if (config === undefined) {
    try {
      configured = JSON.parse(readFileSync(join(cwd, "factory.config.json"), "utf8")).flow?.runLog;
    } catch {
      configured = undefined;
    }
  }
  const relative = configured || DEFAULT_LOG_PATH;
  return isAbsolute(relative) ? relative : join(mainCheckout(cwd), relative);
}

/**
 * Appends one validated event. Throws on an invalid event: an orchestrator that cannot
 * describe a step in the fixed vocabulary should see that, not write free text.
 * @param {Record<string, unknown>} event
 * @param {{ path: string, now?: Date }} options
 */
export function append(event, { path, now = new Date() }) {
  const problems = validateEvent(event);
  if (problems.length > 0) {
    throw new Error(`run-log: ${problems.join("; ")}`);
  }
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({ at: now.toISOString(), ...event })}\n`);
}

/** Every event, oldest first; a line that does not parse is skipped. */
export function readEvents(path) {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip a torn line
    }
  }
  return out;
}

/**
 * Token usage from `bb thread show --json`. The shape of usage in that output is not documented
 * and the current output carries none, so this returns nulls unless a usage object is present.
 * @param {unknown} json parsed output
 * @returns {{ tokensIn: number | null, tokensOut: number | null }}
 */
export function extractUsage(json) {
  const usage = json?.thread?.usage ?? json?.usage ?? json?.thread?.tokenUsage ?? json?.tokenUsage;
  const pick = (...keys) => {
    for (const key of keys) {
      if (Number.isInteger(usage?.[key]) && usage[key] >= 0) {
        return usage[key];
      }
    }
    return null;
  };
  return {
    tokensIn: pick("inputTokens", "input_tokens", "tokensIn", "input"),
    tokensOut: pick("outputTokens", "output_tokens", "tokensOut", "output"),
  };
}
