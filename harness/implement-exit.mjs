/**
 * Implement ADW exit (KIT-54).
 *
 * After the coding Pi session: update the existing workpad, pre-review
 * (rebase, optional worker typecheck-touched, MERGEABLE + required GitHub
 * checks), open one PR into development, move Linear to In Review. Never merge.
 * Worker typecheck is not the gate: skip it when required checks are already
 * green, and do not abort when it throws — GitHub `test` is.
 * Fake `gh` + Linear at this seam. Do not spawn Pi TUI.
 */
import { execFile as execFileCb } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  findMigrationPrefixCollisions,
  formatMigrationCollisionFeedback,
  nextMigrationPrefix,
} from "../scripts/lib/migration-prefix.mjs";
import {
  parseWriteScopeGlobs,
  resolveWriteScopeViolations,
  shouldEnforceWriteScope,
} from "../scripts/lib/pr-write-scope.mjs";
import { ensureLoopCounters, incrementCiFailCycles } from "./auto-merge.mjs";
import { WORKPAD_HEADING } from "./linear-cli.mjs";
import { implementInReviewComment, implementSummaryFromWorkpad } from "./role-comments.mjs";

const execFile = promisify(execFileCb);

export { WORKPAD_HEADING };
export const IMPLEMENT_PR_BASE = "development";
export const IN_REVIEW = "In Review";
export const IMPLEMENTING = "Implementing";
export const REVIEW_FEEDBACK_HEADING = "### Review feedback";
export const CI_LOG_EXCERPT_MAX = 1500;

const GREEN_CONCLUSIONS = new Set([
  "success",
  "skipped",
  "neutral",
  "pass",
  "SUCCESS",
  "SKIPPED",
  "NEUTRAL",
  "PASS",
]);

const FAILED_CONCLUSIONS = new Set([
  "failure",
  "cancelled",
  "canceled",
  "timed_out",
  "fail",
  "FAILURE",
  "CANCELLED",
  "CANCELED",
  "TIMED_OUT",
  "FAIL",
]);

const PENDING_STATUSES = new Set(["IN_PROGRESS", "QUEUED", "PENDING", "pending"]);

/**
 * @param {Array<{ isRequired?: boolean }> | undefined} checks
 */
export function selectRequiredChecks(checks) {
  if (!Array.isArray(checks)) {
    return [];
  }
  const explicit = checks.filter((check) => check.isRequired === true);
  if (explicit.length > 0) {
    return explicit;
  }
  if (checks.length > 0 && checks.every((check) => check.isRequired === false)) {
    return [];
  }
  return checks.filter((check) => check.isRequired !== false);
}

/**
 * @param {Array<{ conclusion?: string, status?: string, isRequired?: boolean, state?: string }> | undefined} checks
 */
export function requiredChecksGreen(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return false;
  }
  const required = selectRequiredChecks(checks);
  if (required.length === 0) {
    return checks.every((check) => check.isRequired === false);
  }
  for (const check of required) {
    const status = check?.status ?? check?.state ?? "";
    if (PENDING_STATUSES.has(status)) {
      return false;
    }
    const conclusion = check?.conclusion ?? "";
    if (!GREEN_CONCLUSIONS.has(conclusion)) {
      return false;
    }
  }
  return true;
}

/**
 * @param {Array<{ conclusion?: string, status?: string, isRequired?: boolean, state?: string }> | undefined} checks
 */
export function requiredChecksFailed(checks) {
  const required = selectRequiredChecks(checks);
  return required.some((check) => FAILED_CONCLUSIONS.has(check?.conclusion ?? check?.state ?? ""));
}

/**
 * Strip tokens and auth headers from CI log excerpts before they hit the workpad.
 *
 * @param {string | undefined} text
 */
export function redactLogSecrets(text) {
  if (typeof text !== "string" || text.length === 0) {
    return "";
  }
  return text
    .replace(/Authorization:\s*Bearer\s+\S+/gi, "Authorization: Bearer [redacted]")
    .replace(/\b(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, "[redacted-token]")
    .replace(/\blin_api_[A-Za-z0-9]+/g, "[redacted-token]")
    .replace(
      /\b(LINEAR_API_KEY|GH_TOKEN|CURSOR_API_KEY|LINEAR_CLI_API_KEY)=[^\s]+/g,
      "$1=[redacted]",
    );
}

/**
 * @param {string | undefined} text
 * @param {number} [max]
 */
export function excerptLog(text, max = CI_LOG_EXCERPT_MAX) {
  const redacted = redactLogSecrets(text).trim();
  if (redacted.length <= max) {
    return redacted;
  }
  return `${redacted.slice(0, max).trimEnd()}\n…`;
}

/**
 * @param {Array<{ name?: string, conclusion?: string, status?: string, isRequired?: boolean, state?: string, log?: string }> | undefined} checks
 */
export function failedRequiredChecks(checks) {
  return selectRequiredChecks(checks).filter((check) =>
    FAILED_CONCLUSIONS.has(check?.conclusion ?? check?.state ?? ""),
  );
}

/**
 * @returns {string[]}
 */
export function formatWriteScopeDiffUnavailableFeedback() {
  return ["- Write-scope: could not read PR diff against origin/development"];
}

/**
 * @param {string[]} violations
 * @returns {string[]}
 */
export function formatWriteScopeViolationFeedback(violations) {
  const lines = ["- Write-scope: PR diff includes paths outside the issue globs:"];
  for (const file of violations) {
    lines.push(`  - \`${file}\``);
  }
  return lines;
}

/**
 * @param {string | undefined} description
 * @param {string[]} changedFiles
 */
export function evaluateWriteScopeExit(description, changedFiles) {
  const globs = parseWriteScopeGlobs(typeof description === "string" ? description : "");
  if (!shouldEnforceWriteScope(globs)) {
    return { enforce: false, violations: [] };
  }
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  const violations = resolveWriteScopeViolations(files, globs);
  return { enforce: true, violations };
}

/**
 * Load `findWriteScopeViolations` from the issue worktree so a PR that added
 * itself to `RATCHET_SCRIPT_PATHS` is not retried against a stale image copy.
 *
 * @param {{
 *   cwd?: string,
 *   importModule?: (specifier: string) => Promise<{ findWriteScopeViolations?: unknown }>,
 * }} [input]
 * @returns {Promise<((files: string[], globs: string[]) => string[]) | null>}
 */
export async function loadWriteScopeEvaluator({ cwd, importModule } = {}) {
  if (typeof cwd !== "string" || cwd.length === 0) {
    return null;
  }
  const modulePath = join(cwd, "scripts/lib/pr-write-scope.mjs");
  if (typeof importModule !== "function" && !existsSync(modulePath)) {
    return null;
  }
  try {
    const load = importModule ?? ((specifier) => import(specifier));
    const spec = typeof importModule === "function" ? modulePath : pathToFileURL(modulePath).href;
    const mod = await load(spec);
    if (typeof mod?.findWriteScopeViolations !== "function") {
      return null;
    }
    return mod.findWriteScopeViolations;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   runCommand?: (command: string, args: string[], options: { cwd?: string }) => Promise<string>,
 * }} [deps]
 */
export function createListChangedFiles({ runCommand } = {}) {
  const run =
    runCommand ??
    (async (command, args, options = {}) => {
      const { stdout } = await execFile(command, args, {
        encoding: "utf8",
        timeout: 120_000,
        cwd: options.cwd,
      });
      return stdout;
    });
  return async ({ cwd, prUrl } = {}) => {
    const stdout =
      typeof prUrl === "string" && prUrl.length > 0
        ? await run("gh", ["pr", "diff", prUrl, "--name-only"], { cwd })
        : await run("git", ["diff", "--name-only", "origin/development...HEAD"], { cwd });
    return String(stdout)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  };
}

/**
 * @param {string | undefined} description
 * @param {{
 *   linear: { getIssue?: (id: string) => Promise<{ description?: string } | null> },
 *   job: { issueId: string, description?: string },
 * }} input
 */
async function resolveIssueDescription(description, { linear, job }) {
  if (typeof description === "string" && description.length > 0) {
    return description;
  }
  if (typeof job?.description === "string" && job.description.length > 0) {
    return job.description;
  }
  if (typeof linear?.getIssue === "function") {
    const issue = await linear.getIssue(job.issueId);
    if (typeof issue?.description === "string") {
      return issue.description;
    }
  }
  return "";
}

/**
 * @param {{
 *   job: { identifier: string, issueId: string },
 *   checkout: { path: string },
 *   linear: {
 *     updateWorkpad: (input: { issueId: string, body: string, commentId?: string }) => Promise<unknown>,
 *     listComments?: (issueId: string) => Promise<Array<{ id: string, body?: string }>>,
 *   },
 *   pr: { url?: string },
 *   feedbackLines: string[],
 * }} input
 */
async function writeWriteScopeRetryWorkpad(input) {
  const { job, linear, pr, feedbackLines } = input;
  const comments =
    typeof linear.listComments === "function" ? await linear.listComments(job.issueId) : [];
  const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
  const withEvidence =
    typeof pr?.url === "string" && pr.url.length > 0
      ? upsertWorkpadEvidence(existing?.body, {
          prUrl: pr.url,
          identifier: job.identifier,
        })
      : (existing?.body ?? `${WORKPAD_HEADING}\n`);
  const body = applyReviewFeedback(withEvidence, feedbackLines);
  await linear.updateWorkpad({ issueId: job.issueId, body, commentId: existing?.id });
  return { status: IMPLEMENTING, writeScopeRetry: true };
}

/**
 * Stay Implementing, write format failure onto the existing workpad, signal cheap retry.
 * Never setStatus(In Review). Never treat this as typecheck (yellow).
 *
 * @param {{
 *   job: { identifier: string, issueId: string },
 *   linear: {
 *     updateWorkpad: (input: { issueId: string, body: string, commentId?: string }) => Promise<unknown>,
 *     listComments?: (issueId: string) => Promise<Array<{ id: string, body?: string }>>,
 *   },
 *   pr: { url?: string },
 *   error?: unknown,
 * }} input
 */
async function writeFormatRetryWorkpad(input) {
  const { job, linear, pr, error } = input;
  const message = error instanceof Error ? error.message : String(error ?? "format-check failed");
  const excerpt = excerptLog(message);
  const feedbackLines = [
    "- Format: `pnpm format:check` / `biome ci .` failed. This is red — not typecheck. Fix format before GitHub wait.",
  ];
  for (const line of excerpt.split("\n")) {
    if (line.length > 0) {
      feedbackLines.push(`  ${line}`);
    }
  }
  const comments =
    typeof linear.listComments === "function" ? await linear.listComments(job.issueId) : [];
  const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
  const withEvidence =
    typeof pr?.url === "string" && pr.url.length > 0
      ? upsertWorkpadEvidence(existing?.body, {
          prUrl: pr.url,
          identifier: job.identifier,
        })
      : (existing?.body ?? `${WORKPAD_HEADING}\n`);
  const body = applyReviewFeedback(withEvidence, feedbackLines);
  await linear.updateWorkpad({ issueId: job.issueId, body, commentId: existing?.id });
  return { pr, status: IMPLEMENTING, formatRetry: true, ciRetry: false, writeScopeRetry: false };
}

/**
 * Stay Implementing and cheap-retry when a new migration reuses a lane prefix.
 *
 * @param {{
 *   job: { identifier: string, issueId: string },
 *   linear: {
 *     updateWorkpad: (input: { issueId: string, body: string, commentId?: string }) => Promise<unknown>,
 *     listComments?: (issueId: string) => Promise<Array<{ id: string, body?: string }>>,
 *   },
 *   pr: { url?: string },
 *   feedbackLines: string[],
 * }} input
 */
async function writeMigrationRetryWorkpad(input) {
  const { job, linear, pr, feedbackLines } = input;
  const comments =
    typeof linear.listComments === "function" ? await linear.listComments(job.issueId) : [];
  const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
  const withEvidence =
    typeof pr?.url === "string" && pr.url.length > 0
      ? upsertWorkpadEvidence(existing?.body, {
          prUrl: pr.url,
          identifier: job.identifier,
        })
      : (existing?.body ?? `${WORKPAD_HEADING}\n`);
  const body = applyReviewFeedback(withEvidence, feedbackLines);
  await linear.updateWorkpad({ issueId: job.issueId, body, commentId: existing?.id });
  return {
    pr,
    status: IMPLEMENTING,
    migrationRetry: true,
    ciRetry: false,
    writeScopeRetry: false,
    formatRetry: false,
  };
}

/**
 * List `packages/db/migrations/*.sql` on the integration lane.
 *
 * @param {{
 *   runCommand?: (command: string, args: string[], options: { cwd?: string }) => Promise<string>,
 * }} [deps]
 */
export function createListBaseMigrations({ runCommand } = {}) {
  const run =
    runCommand ??
    (async (command, args, options = {}) => {
      const { stdout } = await execFile(command, args, {
        encoding: "utf8",
        timeout: 120_000,
        cwd: options.cwd,
      });
      return stdout;
    });
  return async ({ cwd } = {}) => {
    const stdout = await run(
      "git",
      ["ls-tree", "-r", "--name-only", "origin/development", "--", "packages/db/migrations"],
      { cwd },
    );
    return String(stdout)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  };
}

/**
 * @param {Array<{ name?: string, conclusion?: string, status?: string, isRequired?: boolean, state?: string, log?: string }> | undefined} checks
 * @param {{ timedOut?: boolean }} [options]
 * @returns {string[]}
 */
export function formatCiFailureFeedback(checks, { timedOut = false } = {}) {
  const lines = [];
  if (timedOut) {
    lines.push("- CI: timed out waiting for required GitHub checks");
  }
  const failed = failedRequiredChecks(checks);
  for (const check of failed) {
    const name = typeof check.name === "string" && check.name.length > 0 ? check.name : "unknown";
    lines.push(`- CI: required check \`${name}\` failed`);
    if (typeof check.log === "string" && check.log.trim().length > 0) {
      const excerpt = excerptLog(check.log);
      for (const line of excerpt.split("\n")) {
        lines.push(`  ${line}`);
      }
    }
  }
  if (timedOut) {
    const required = selectRequiredChecks(checks);
    for (const check of required) {
      if (FAILED_CONCLUSIONS.has(check?.conclusion ?? check?.state ?? "")) {
        continue;
      }
      const name = typeof check.name === "string" && check.name.length > 0 ? check.name : "unknown";
      const status = check?.status ?? check?.state ?? "unknown";
      lines.push(`- CI: required check \`${name}\` still ${status}`);
    }
  }
  if (!timedOut && failed.length === 0) {
    lines.push("- CI: required GitHub checks are not green");
  }
  return lines;
}

/**
 * @param {string | undefined} current
 * @param {string[]} feedbackLines
 */
export function applyReviewFeedback(current, feedbackLines) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;
  const lines =
    Array.isArray(feedbackLines) && feedbackLines.length > 0 ? feedbackLines : ["- (none)"];
  const content = lines.join("\n");
  if (base.includes(REVIEW_FEEDBACK_HEADING)) {
    return `${base.replace(/### Review feedback\n[\s\S]*?(?=\n### |\s*$)/, `${REVIEW_FEEDBACK_HEADING}\n\n${content}\n`)}\n`;
  }
  return `${base}\n\n${REVIEW_FEEDBACK_HEADING}\n\n${content}\n`;
}

/**
 * @param {string | undefined} body
 */
export function extractReviewFeedback(body) {
  if (typeof body !== "string" || !body.includes(REVIEW_FEEDBACK_HEADING)) {
    return "";
  }
  const match = body.match(/### Review feedback\n([\s\S]*?)(?=\n### |\s*$)/);
  return match ? match[1].trim() : "";
}

/**
 * Workpad Review feedback that implement must act on (checker fail or CI excerpt).
 * Clean three-axis `(none)` and a lone `- (none)` are not actionable.
 *
 * @param {string | undefined} feedback
 */
export function reviewFeedbackIsActionable(feedback) {
  const text = typeof feedback === "string" ? feedback.trim() : "";
  if (text.length === 0) {
    return false;
  }
  if (reviewFeedbackIsLandFail(text)) {
    return true;
  }
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return false;
  }
  return !lines.every(
    (line) =>
      /^-\s*(?:Spec|Standards|Slop|Tests):\s*\(none\)\s*$/i.test(line) ||
      /^-\s*\(none\)\s*$/i.test(line),
  );
}

/**
 * Land merge gate wrote this feedback — orchestration, not checker Spec/Standards/Slop.
 *
 * @param {string | undefined} feedback
 */
export function reviewFeedbackIsLandFail(feedback) {
  const text = typeof feedback === "string" ? feedback.trim() : "";
  if (text.length === 0) {
    return false;
  }
  if (/^-\s*(?:Spec|Standards|Slop|Tests|Format|CI):/im.test(text)) {
    return false;
  }
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.some(
    (line) =>
      /^-\s*PR is (UNKNOWN|CONFLICTING)/i.test(line) ||
      /^-\s*required checks are not green/i.test(line) ||
      /^-\s*PR base .+ is not /i.test(line) ||
      /^-\s*no linked PR/i.test(line) ||
      /^-\s*protected branch/i.test(line) ||
      /^-\s*refusing --force/i.test(line) ||
      /^-\s*merge (?:failed|succeeded but)/i.test(line) ||
      /^-\s*Command failed: gh pr merge/i.test(line) ||
      /not up to date with the base branch/i.test(line),
  );
}

/**
 * @param {Array<{ name?: string, conclusion?: string, status?: string, isRequired?: boolean, state?: string, log?: string }> | undefined} checks
 * @param {{ fetchCheckLog?: (input: { cwd: string, name?: string }) => Promise<string> }} gh
 * @param {string} cwd
 */
export async function attachFailedCheckLogs(checks, gh, cwd) {
  if (!Array.isArray(checks)) {
    return [];
  }
  const attached = [];
  for (const check of checks) {
    let log = check.log;
    const failed = FAILED_CONCLUSIONS.has(check?.conclusion ?? check?.state ?? "");
    if (
      failed &&
      (typeof log !== "string" || log.trim().length === 0) &&
      typeof gh?.fetchCheckLog === "function"
    ) {
      try {
        log = await gh.fetchCheckLog({ cwd, name: check.name });
      } catch {
        log = "";
      }
    }
    attached.push({ ...check, log });
  }
  return attached;
}

/**
 * @param {string | undefined} adwText
 */
export function assertAdwOpensPr(adwText) {
  if (typeof adwText !== "string") {
    throw new Error("implement ADW is missing");
  }
  if (!/^ {2}- pr$/m.test(adwText) || !/^ {2}- in-review$/m.test(adwText)) {
    throw new Error("implement ADW must open a PR; harness moves to In Review after green checks");
  }
  if (!/^never:\s*$/m.test(adwText) || !/^ {2}- merge$/m.test(adwText)) {
    throw new Error("implement ADW must never merge");
  }
}

const WORKSPACE_DIR_PREFIXES = ["apps/", "packages/", "seed/"];

/**
 * Map a git diff path list to pnpm `--filter` directory selectors.
 * `harness/**` and `.pi/**` are not workspace packages.
 *
 * @param {string[]} paths
 * @returns {string[]}
 */
export function workspacePackagesFromDiff(paths) {
  const packages = new Set();
  for (const file of paths) {
    if (typeof file !== "string" || file.length === 0) {
      continue;
    }
    const normalized = file.replaceAll("\\", "/");
    for (const prefix of WORKSPACE_DIR_PREFIXES) {
      if (!normalized.startsWith(prefix)) {
        continue;
      }
      const name = normalized.slice(prefix.length).split("/")[0];
      if (typeof name === "string" && name.length > 0) {
        packages.add(`./${prefix}${name}`);
      }
    }
  }
  return [...packages].sort();
}

/**
 * Typecheck packages changed since `origin/development`. Never `pnpm test`.
 * Skip when the diff has no workspace packages (do not spawn pnpm).
 *
 * @param {{
 *   runCommand?: (command: string, args: string[], options: { cwd?: string }) => Promise<string>,
 * }} [deps]
 */
export function createTypecheckTouched({ runCommand } = {}) {
  const run =
    runCommand ??
    (async (command, args, options = {}) => {
      const { stdout } = await execFile(command, args, {
        encoding: "utf8",
        timeout: 300_000,
        cwd: options.cwd,
      });
      return stdout;
    });
  return async ({ cwd }) => {
    const stdout = await run("git", ["diff", "--name-only", "origin/development...HEAD"], { cwd });
    const files = String(stdout)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const packages = workspacePackagesFromDiff(files);
    if (packages.length === 0) {
      return;
    }
    for (const filter of packages) {
      await run("pnpm", ["--filter", filter, "typecheck"], { cwd });
    }
  };
}

/**
 * `pnpm format:check` (`biome ci .`). Fall back to image-global `biome` when
 * the worktree has no node_modules. Format-fail is red — not typecheck.
 *
 * @param {{
 *   runCommand?: (command: string, args: string[], options: { cwd?: string }) => Promise<string>,
 * }} [deps]
 */
export function createFormatCheck({ runCommand } = {}) {
  const run =
    runCommand ??
    (async (command, args, options = {}) => {
      const { stdout } = await execFile(command, args, {
        encoding: "utf8",
        timeout: 120_000,
        cwd: options.cwd,
      });
      return stdout;
    });
  return async ({ cwd }) => {
    try {
      await run("pnpm", ["format:check"], { cwd });
    } catch {
      await run("biome", ["ci", "."], { cwd });
    }
  };
}

/**
 * @param {string | undefined} current
 * @param {{ prUrl: string, identifier: string }} evidence
 */
export function upsertWorkpadEvidence(current, { prUrl, identifier }) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : `${WORKPAD_HEADING}\n`;
  const line = `- ${identifier} PR: ${prUrl}`;
  if (base.includes(prUrl)) {
    return `${base}\n`;
  }
  if (base.includes("### Evidence")) {
    return `${base.replace("### Evidence", `### Evidence\n${line}`)}\n`;
  }
  return `${base}\n\n### Evidence\n${line}\n`;
}

/**
 * @param {{ url?: string, mergeable?: string, checks?: object[] } | null | undefined} pr
 * @param {{ url?: string, mergeable?: string, checks?: object[] } | null} listed
 * @param {string} identifier
 */
function applyListedPr(pr, listed, identifier) {
  if (listed?.url && typeof pr?.url === "string" && pr.url.length > 0 && listed.url !== pr.url) {
    throw new Error(`${identifier} has multiple open PRs`);
  }
  if ((typeof pr?.url !== "string" || pr.url.length === 0) && typeof listed?.url === "string") {
    return {
      url: listed.url,
      mergeable: listed.mergeable ?? pr?.mergeable ?? "UNKNOWN",
      checks: listed.checks ?? pr?.checks ?? [],
    };
  }
  return pr;
}

/**
 * @param {{
 *   job: { identifier: string, issueId: string, adwFile?: string },
 *   checkout: { path: string, branch: string },
 *   gh: {
 *     rebase: (input: { cwd: string, onto: string }) => Promise<unknown>,
 *     viewPr: (input: { cwd: string }) => Promise<{ url?: string, mergeable?: string, checks?: object[] } | null>,
 *     createPr: (input: object) => Promise<{ url: string, mergeable?: string, checks?: object[] }>,
 *     merge?: (input?: object) => unknown,
 *   },
 *   linear: {
 *     updateWorkpad: (input: { issueId: string, body: string }) => Promise<unknown>,
 *     listComments?: (issueId: string) => Promise<Array<{ id: string, body?: string }>>,
 *     setStatus: (input: { issueId: string, status: string }) => Promise<unknown>,
 *     getIssue?: (id: string) => Promise<{ description?: string } | null>,
 *   },
 *   typecheckTouched: (input: { cwd: string }) => Promise<unknown>,
 *   formatCheck?: (input: { cwd: string }) => Promise<unknown>,
 *   listChangedFiles?: (input: { cwd: string }) => Promise<string[]>,
 *   listBaseMigrations?: (input: { cwd: string }) => Promise<string[]>,
 *   findWriteScopeViolationsWorktree?: (files: string[], globs: string[]) => string[],
 *   importWriteScopeModule?: (specifier: string) => Promise<{ findWriteScopeViolations?: unknown }>,
 *   issueDescription?: string,
 *   runPnpmTest?: (input: { cwd: string }) => Promise<unknown>,
 *   adwText: string,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<unknown>,
 *   waitTimeoutMs?: number,
 *   waitIntervalMs?: number,
 * }} input
 */
export async function completeImplementAdw(input) {
  const {
    job,
    checkout,
    gh,
    linear,
    typecheckTouched,
    formatCheck,
    listChangedFiles: listChangedFilesInput,
    listBaseMigrations: listBaseMigrationsInput,
    findWriteScopeViolationsWorktree,
    importWriteScopeModule,
    issueDescription,
    runPnpmTest,
    adwText,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    waitTimeoutMs = 30 * 60 * 1000,
    waitIntervalMs = 15_000,
  } = input;
  assertAdwOpensPr(adwText);

  let listed = null;
  if (typeof gh.findOpenIssuePr === "function") {
    listed = await gh.findOpenIssuePr({ identifier: job.identifier });
  }
  let pr = applyListedPr(await gh.viewPr({ cwd: checkout.path }), listed, job.identifier);
  const existingPrUrl =
    (typeof pr?.url === "string" && pr.url.length > 0 && pr.url) ||
    (typeof listed?.url === "string" && listed.url) ||
    "";
  const alreadyMergeable = pr?.mergeable === "MERGEABLE" && existingPrUrl.length > 0;
  const listChangedFiles = listChangedFilesInput ?? createListChangedFiles();
  try {
    const changedForMigrations = await listChangedFiles({
      cwd: checkout.path,
      prUrl: existingPrUrl || pr?.url,
    });
    const listBase = listBaseMigrationsInput ?? createListBaseMigrations();
    const baseMigrations = await listBase({ cwd: checkout.path });
    const collisions = findMigrationPrefixCollisions(changedForMigrations, baseMigrations);
    if (collisions.length > 0) {
      return writeMigrationRetryWorkpad({
        job,
        linear,
        pr: pr ?? { url: existingPrUrl },
        feedbackLines: formatMigrationCollisionFeedback(
          collisions,
          nextMigrationPrefix(baseMigrations),
        ),
      });
    }
  } catch {
    // rebase / write-scope still run; CI check-migration-prefixes is the floor
  }
  if (alreadyMergeable) {
    if (typeof gh.syncToRemoteBranch === "function") {
      await gh.syncToRemoteBranch({ cwd: checkout.path, branch: checkout.branch });
    }
  } else {
    await gh.rebase({ cwd: checkout.path, onto: "origin/development", branch: checkout.branch });
    if (existingPrUrl.length > 0) {
      pr = applyListedPr(await gh.viewPr({ cwd: checkout.path }), listed, job.identifier);
    }
  }
  const checksAlreadyGreen = alreadyMergeable && requiredChecksGreen(pr?.checks);
  if (!checksAlreadyGreen) {
    try {
      await typecheckTouched({ cwd: checkout.path });
    } catch {
      // Worker typecheck is a best-effort fast fail. Missing node_modules or
      // OOM on the 4 GB box must not park Implementing while GitHub test is
      // the required check (KIT-116).
    }
  }
  if (typeof formatCheck === "function") {
    try {
      await formatCheck({ cwd: checkout.path });
    } catch (error) {
      return writeFormatRetryWorkpad({ job, linear, pr, error });
    }
  }
  if (typeof runPnpmTest === "function") {
    throw new Error("full pnpm test stays on GitHub Actions, not on this worker");
  }

  if (typeof pr?.url !== "string" || pr.url.length === 0) {
    pr = await gh.createPr({
      cwd: checkout.path,
      base: IMPLEMENT_PR_BASE,
      head: checkout.branch,
      title: `${job.identifier}: implement`,
      identifier: job.identifier,
    });
  }

  const deadline = now() + waitTimeoutMs;
  while (true) {
    const next = await gh.viewPr({ cwd: checkout.path });
    if (typeof next?.url === "string" && next.url.length > 0) {
      pr = next;
    }
    if (requiredChecksFailed(pr?.checks)) {
      return writeCiRetryWorkpad({
        job,
        checkout,
        gh,
        linear,
        pr,
        timedOut: false,
      });
    }
    if (pr?.mergeable === "MERGEABLE" && requiredChecksGreen(pr.checks)) {
      break;
    }
    if (now() >= deadline) {
      return writeCiRetryWorkpad({
        job,
        checkout,
        gh,
        linear,
        pr,
        timedOut: true,
      });
    }
    await sleep(waitIntervalMs);
  }

  const description = await resolveIssueDescription(issueDescription, { linear, job });
  const globs = parseWriteScopeGlobs(description);
  if (shouldEnforceWriteScope(globs)) {
    let changedFiles;
    try {
      changedFiles = await listChangedFiles({ cwd: checkout.path, prUrl: pr?.url });
    } catch {
      const retry = await writeWriteScopeRetryWorkpad({
        job,
        linear,
        pr,
        feedbackLines: formatWriteScopeDiffUnavailableFeedback(),
      });
      return { pr, ...retry, ciRetry: false };
    }
    const worktreeFind =
      typeof findWriteScopeViolationsWorktree === "function"
        ? findWriteScopeViolationsWorktree
        : await loadWriteScopeEvaluator({
            cwd: checkout.path,
            importModule: importWriteScopeModule,
          });
    const violations = resolveWriteScopeViolations(changedFiles, globs, worktreeFind ?? undefined);
    if (violations.length > 0) {
      const retry = await writeWriteScopeRetryWorkpad({
        job,
        linear,
        pr,
        feedbackLines: formatWriteScopeViolationFeedback(violations),
      });
      return { pr, ...retry, ciRetry: false };
    }
  }

  const comments =
    typeof linear.listComments === "function" ? await linear.listComments(job.issueId) : [];
  const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
  const body = ensureLoopCounters(
    upsertWorkpadEvidence(existing?.body, {
      prUrl: pr.url,
      identifier: job.identifier,
    }),
  );
  await linear.updateWorkpad({ issueId: job.issueId, body, commentId: existing?.id });
  if (typeof linear.commentIssue === "function") {
    await linear.commentIssue({
      issueId: job.issueId,
      body: implementInReviewComment(job.identifier, {
        prUrl: pr.url,
        summary: implementSummaryFromWorkpad(body),
      }),
    });
  }
  await linear.setStatus({ issueId: job.issueId, status: IN_REVIEW });

  return {
    pr,
    status: IN_REVIEW,
    ciRetry: false,
    writeScopeRetry: false,
    formatRetry: false,
    migrationRetry: false,
  };
}

/**
 * Stay Implementing, write CI failure onto the existing workpad, signal retry.
 * Never setStatus(In Review). Never spawn factory-checker.
 *
 * @param {{
 *   job: { identifier: string, issueId: string },
 *   checkout: { path: string },
 *   gh: { fetchCheckLog?: Function },
 *   linear: {
 *     updateWorkpad: (input: { issueId: string, body: string, commentId?: string }) => Promise<unknown>,
 *     listComments?: (issueId: string) => Promise<Array<{ id: string, body?: string }>>,
 *     setStatus: (input: { issueId: string, status: string }) => Promise<unknown>,
 *   },
 *   pr: { url?: string, checks?: object[] },
 *   timedOut: boolean,
 * }} input
 */
async function writeCiRetryWorkpad(input) {
  const { job, checkout, gh, linear, pr, timedOut } = input;
  const checks = await attachFailedCheckLogs(pr?.checks, gh, checkout.path);
  const comments =
    typeof linear.listComments === "function" ? await linear.listComments(job.issueId) : [];
  const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
  const withEvidence =
    typeof pr?.url === "string" && pr.url.length > 0
      ? upsertWorkpadEvidence(existing?.body, {
          prUrl: pr.url,
          identifier: job.identifier,
        })
      : (existing?.body ?? `${WORKPAD_HEADING}\n`);
  const body = incrementCiFailCycles(
    applyReviewFeedback(withEvidence, formatCiFailureFeedback(checks, { timedOut })),
  );
  await linear.updateWorkpad({ issueId: job.issueId, body, commentId: existing?.id });
  return { pr, status: IMPLEMENTING, ciRetry: true };
}
