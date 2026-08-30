/**
 * Harness-owned review snapshot for factory-checker (token save).
 * Captures merge-base three-dot diff + short log + capped issue Spec body
 * so Pi does not spend turns on `git diff` discovery or full CONTEXT dumps.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

/** Cap injected unified diff (chars). Oversized diffs truncate with a marker. */
export const MAX_CHECKER_DIFF_CHARS = 80_000;
/** Cap issue description / What to build + AC for Spec. */
export const MAX_CHECKER_ISSUE_CHARS = 12_000;
/** Cap `git log --oneline` block. */
export const MAX_CHECKER_LOG_CHARS = 4_000;
/** Cap `--stat` block. */
export const MAX_CHECKER_STAT_CHARS = 4_000;

/**
 * @param {string | undefined} text
 * @param {number} max
 * @returns {{ text: string, truncated: boolean }}
 */
export function truncateForChecker(text, max) {
  const raw = typeof text === "string" ? text : "";
  if (raw.length <= max) {
    return { text: raw, truncated: false };
  }
  return {
    text: `${raw.slice(0, Math.max(0, max - 80))}\n\n… [truncated for checker token budget]\n`,
    truncated: true,
  };
}

/**
 * @param {{
 *   cwd: string,
 *   lane?: string,
 *   runGit?: (args: string[], cwd: string) => Promise<string>,
 * }} input
 */
export async function captureCheckerReviewDiff({
  cwd,
  lane = "development",
  runGit = defaultRunGit,
}) {
  if (typeof cwd !== "string" || cwd.length === 0) {
    throw new Error("captureCheckerReviewDiff requires cwd");
  }
  const remoteLane = `origin/${lane}`;
  let mergeBase = "";
  try {
    mergeBase = (await runGit(["merge-base", remoteLane, "HEAD"], cwd)).trim();
  } catch {
    mergeBase = "";
  }
  const range = mergeBase.length > 0 ? `${mergeBase}...HEAD` : `${remoteLane}...HEAD`;
  let diff = "";
  let stat = "";
  let log = "";
  try {
    diff = await runGit(["diff", range], cwd);
  } catch (error) {
    diff = `… [git diff failed: ${error instanceof Error ? error.message : String(error)}]`;
  }
  try {
    stat = await runGit(["diff", "--stat", range], cwd);
  } catch {
    stat = "";
  }
  try {
    const logRange = mergeBase.length > 0 ? `${mergeBase}..HEAD` : `${remoteLane}..HEAD`;
    log = await runGit(["log", "--oneline", logRange], cwd);
  } catch {
    log = "";
  }
  const diffCap = truncateForChecker(diff, MAX_CHECKER_DIFF_CHARS);
  const statCap = truncateForChecker(stat, MAX_CHECKER_STAT_CHARS);
  const logCap = truncateForChecker(log, MAX_CHECKER_LOG_CHARS);
  return {
    lane,
    mergeBase: mergeBase || "(unknown)",
    range,
    diff: diffCap.text,
    stat: statCap.text,
    log: logCap.text,
    truncated: diffCap.truncated || statCap.truncated || logCap.truncated,
    empty: diff.trim().length === 0,
  };
}

/**
 * @param {string[]} args
 * @param {string} cwd
 */
async function defaultRunGit(args, cwd) {
  const { stdout } = await execFile("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 12 * 1024 * 1024,
    timeout: 60_000,
  });
  return typeof stdout === "string" ? stdout : "";
}

/**
 * @param {{
 *   identifier?: string,
 *   issueDescription?: string,
 *   review?: Awaited<ReturnType<typeof captureCheckerReviewDiff>> | null,
 * }} input
 */
export function formatCheckerReviewBundle({ identifier, issueDescription, review }) {
  const parts = ["# Injected review snapshot (harness)", ""];
  if (typeof identifier === "string" && identifier.length > 0) {
    parts.push(`Issue: ${identifier}`, "");
  }
  parts.push(
    "Use this snapshot for Spec / Standards / Slop. Prefer it over discovering the diff via bash.",
    "Do **not** read full `CONTEXT.md` or `docs/design-system.md` unless a named AC term is missing here.",
    "Do **not** poll `gh pr checks` — harness owns GitHub gates after you exit.",
    "Readonly `git diff|log|rev-parse` bash is allowed only to fill gaps (e.g. one file).",
    "",
  );
  const issueCap = truncateForChecker(issueDescription ?? "", MAX_CHECKER_ISSUE_CHARS);
  parts.push("## Spec source (issue description)", "");
  parts.push(issueCap.text.length > 0 ? issueCap.text : "(no issue description)");
  parts.push("");
  if (review) {
    parts.push(`## Diff vs ${review.lane} (three-dot)`, "");
    parts.push(`Merge-base: \`${review.mergeBase}\``);
    parts.push(`Range: \`${review.range}\``);
    if (review.truncated) {
      parts.push("Truncated: yes — open individual files with `read` for hunks beyond the cap.");
    }
    if (review.empty) {
      parts.push("Diff is empty — fail closed on Spec if the issue expected code changes.");
    }
    parts.push("", "### Stat", "");
    parts.push(review.stat.trim().length > 0 ? review.stat.trimEnd() : "(empty)");
    parts.push("", "### Log", "");
    parts.push(review.log.trim().length > 0 ? review.log.trimEnd() : "(empty)");
    parts.push("", "### Unified diff", "");
    parts.push("```diff");
    parts.push(review.diff.trimEnd());
    parts.push("```");
    parts.push("");
  } else {
    parts.push("## Diff", "", "(snapshot unavailable — use readonly `git diff origin/development...HEAD`)", "");
  }
  return parts.join("\n");
}
