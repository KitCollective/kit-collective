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
  "SUCCESS",
  "SKIPPED",
  "NEUTRAL",
]);

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

/**
 * @param {Array<{ conclusion?: string, status?: string }> | undefined} checks
 */
export function requiredChecksGreen(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return false;
  }
  for (const check of checks) {
    const status = check?.status ?? "";
    if (status === "IN_PROGRESS" || status === "QUEUED" || status === "PENDING") {
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
 * Typecheck packages changed since `origin/development`. Never `pnpm test`.
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
    await run("pnpm", ["--filter", "...[origin/development]", "typecheck"], { cwd });
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
 * }} input
 */
export async function completeImplementAdw(input) {
  const { job, checkout, gh, linear, typecheckTouched, runPnpmTest, adwText } = input;
  assertAdwOpensPr(adwText);

  await gh.rebase({ cwd: checkout.path, onto: "origin/development" });
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
  pr = (await gh.viewPr({ cwd: checkout.path })) ?? pr;
  if (pr?.mergeable !== "MERGEABLE") {
    throw new Error("pre-review: PR is not MERGEABLE");
  }
  if (!requiredChecksGreen(pr.checks)) {
    throw new Error("pre-review: required GitHub checks are not green");
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
