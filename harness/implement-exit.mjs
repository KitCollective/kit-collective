/**
 * Implement ADW exit (KIT-54).
 *
 * After the coding Pi session: update the existing workpad, pre-review
 * (rebase, typecheck-touched, MERGEABLE + required GitHub checks), open one
 * PR into development, move Linear to In Review. Never merge.
 * Fake `gh` + Linear at this seam. Do not spawn Pi TUI.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export const WORKPAD_HEADING = "## Agent Workpad";
export const IMPLEMENT_PR_BASE = "development";
export const IN_REVIEW = "In Review";

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
 * @param {string | undefined} adwText
 */
export function assertAdwOpensPr(adwText) {
  if (typeof adwText !== "string") {
    throw new Error("implement ADW is missing");
  }
  if (!/^ {2}- pr$/m.test(adwText) || !/^ {2}- in-review$/m.test(adwText)) {
    throw new Error("implement ADW must open a PR and move to In Review");
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
 *   },
 *   typecheckTouched: (input: { cwd: string }) => Promise<unknown>,
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
    runPnpmTest,
    adwText,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    waitTimeoutMs = 30 * 60 * 1000,
    waitIntervalMs = 15_000,
  } = input;
  assertAdwOpensPr(adwText);

  await gh.rebase({ cwd: checkout.path, onto: "origin/development", branch: checkout.branch });
  await typecheckTouched({ cwd: checkout.path });
  if (typeof runPnpmTest === "function") {
    throw new Error("full pnpm test stays on GitHub Actions, not on this worker");
  }

  let pr = await gh.viewPr({ cwd: checkout.path });
  if (typeof pr?.url !== "string" || pr.url.length === 0) {
    pr = await gh.createPr({
      cwd: checkout.path,
      base: IMPLEMENT_PR_BASE,
      head: checkout.branch,
      title: `${job.identifier}: implement`,
    });
  }

  const deadline = now() + waitTimeoutMs;
  while (true) {
    pr = (await gh.viewPr({ cwd: checkout.path })) ?? pr;
    if (requiredChecksFailed(pr?.checks)) {
      throw new Error("pre-review: required GitHub checks are not green");
    }
    if (pr?.mergeable === "MERGEABLE" && requiredChecksGreen(pr.checks)) {
      break;
    }
    if (now() >= deadline) {
      throw new Error("pre-review: timed out waiting for required GitHub checks");
    }
    await sleep(waitIntervalMs);
  }

  const comments =
    typeof linear.listComments === "function" ? await linear.listComments(job.issueId) : [];
  const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
  const body = upsertWorkpadEvidence(existing?.body, {
    prUrl: pr.url,
    identifier: job.identifier,
  });
  await linear.updateWorkpad({ issueId: job.issueId, body, commentId: existing?.id });
  await linear.setStatus({ issueId: job.issueId, status: IN_REVIEW });

  return { pr, status: IN_REVIEW };
}
