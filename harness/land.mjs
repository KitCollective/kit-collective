/**
 * Land job (KIT-57).
 *
 * Wakes on Merging. Calls KIT-51 `landAtMergeGate` with fake `gh` at that seam.
 * Success → Done + SHA on the workpad. Merge failure → Implementing + Review
 * feedback. Never `--force`. Never staging or production.
 */
import { execFile as execFileCb, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import {
  landAtMergeGate,
  LAND_UNKNOWN_MERGEABLE_RETRIES,
  LAND_UNKNOWN_RETRY_MS,
  MERGE_FAILURE_STATUS,
  MERGE_PERMISSION_STATUS,
  MERGED_STATUS,
} from "../scripts/lib/land-policy.mjs";
import { mapStatusChecks } from "./gh-cli.mjs";
import { selectRequiredChecks } from "./implement-exit.mjs";
import { WORKPAD_HEADING } from "./linear-cli.mjs";
import { landFailComment, landSuccessComment } from "./role-comments.mjs";
import { gitArgvContainsSecret, remoteGitChildEnv } from "./worktree.mjs";

const execFile = promisify(execFileCb);

export const LAND_LANES = {
  integration: "development",
  staging: "staging",
  production: "production",
};

export const DEFAULT_LAND_REPO = "KitCollective/kit-collective";

/**
 * KIT-51 `landAtMergeGate` treats every `requiredChecks` entry as required.
 * Pass only `isRequired` rows, with lowercase conclusions the gate allows.
 *
 * @param {Array<{ name?: string, conclusion?: string, isRequired?: boolean }> | undefined} mapped
 * @returns {Array<{ name?: string, conclusion: string }> | undefined}
 */
export function requiredChecksForMergeGate(mapped) {
  const required = selectRequiredChecks(mapped);
  if (required.length === 0) {
    return undefined;
  }
  return required.map((check) => ({
    name: check.name,
    conclusion: String(check.conclusion ?? "").toLowerCase(),
  }));
}

const GITHUB_PULL =
  /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)(?:\/(?:files|commits|checks)?)?(?:#.*)?$/;

/**
 * @param {Array<{ url?: string }> | undefined} attachments
 * @returns {{ number: number, repo: string, url: string } | null}
 */
export function pullRequestFromAttachments(attachments) {
  if (!Array.isArray(attachments)) {
    return null;
  }
  for (const attachment of attachments) {
    const url = attachment?.url;
    if (typeof url !== "string") {
      continue;
    }
    const match = url.match(GITHUB_PULL);
    if (!match) {
      continue;
    }
    return {
      repo: match[1],
      number: Number(match[2]),
      url: `https://github.com/${match[1]}/pull/${match[2]}`,
    };
  }
  return null;
}

/**
 * @param {string | undefined} current
 * @param {{ sha?: string, error?: string }} update
 */
export function applyLandWorkpad(current, { sha, error } = {}) {
  const base =
    typeof current === "string" && current.includes(WORKPAD_HEADING)
      ? current.trimEnd()
      : WORKPAD_HEADING;

  if (typeof sha === "string" && sha.length > 0) {
    const withEvidence = upsertHeading(base, "### Evidence", `- land SHA: ${sha}`);
    return `${replaceReviewFeedback(withEvidence, "- (none)")}\n`;
  }
  if (typeof error === "string" && error.length > 0) {
    return `${replaceReviewFeedback(base, `- ${error}`)}\n`;
  }
  return `${base}\n`;
}

/**
 * @param {string} body
 * @param {string} heading
 * @param {string} line
 */
function upsertHeading(body, heading, line) {
  if (body.includes(line)) {
    return body;
  }
  if (body.includes(heading)) {
    return body.replace(heading, `${heading}\n${line}`);
  }
  return `${body}\n\n${heading}\n${line}`;
}

/**
 * @param {string} body
 * @param {string} line
 */
function replaceReviewFeedback(body, line) {
  if (body.includes("### Review feedback")) {
    return body.replace(
      /### Review feedback\n[\s\S]*?(?=\n### |\s*$)/,
      `### Review feedback\n\n${line}\n`,
    );
  }
  return `${body}\n\n### Review feedback\n\n${line}\n`;
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   repo?: string,
 *   runCommand?: (command: string, args: string[], options: { cwd?: string, env?: NodeJS.ProcessEnv }) => Promise<string>,
 *   runSync?: (command: string, args: string[], options: { env?: NodeJS.ProcessEnv }) => string,
 * }} [deps]
 */
export function createLandGh({
  env = process.env,
  repo = DEFAULT_LAND_REPO,
  runCommand,
  runSync,
} = {}) {
  const invokeAsync =
    runCommand ??
    (async (command, args, options) => {
      const { stdout } = await execFile(command, args, {
        encoding: "utf8",
        timeout: 120_000,
        cwd: options.cwd,
        env: options.env,
      });
      return stdout;
    });
  const invokeSync =
    runSync ??
    ((command, args, options) =>
      execFileSync(command, args, {
        encoding: "utf8",
        timeout: 120_000,
        env: options.env,
      }));

  /**
   * @param {string} command
   * @param {string[]} args
   * @param {"async" | "sync"} mode
   */
  function guarded(command, args, mode) {
    const childEnv = remoteGitChildEnv({ ...process.env, ...env });
    if (gitArgvContainsSecret(args, childEnv)) {
      throw new Error("git argv must not contain GH_TOKEN");
    }
    if (mode === "sync") {
      return invokeSync(command, args, { env: childEnv });
    }
    return invokeAsync(command, args, { env: childEnv });
  }

  return {
    /**
     * @param {{ number: number, repo?: string }} input
     */
    async viewPr({ number, repo: repoOverride }) {
      const targetRepo = repoOverride ?? repo;
      const stdout = await guarded(
        "gh",
        [
          "pr",
          "view",
          String(number),
          "--repo",
          targetRepo,
          "--json",
          "number,url,mergeable,baseRefName,statusCheckRollup",
        ],
        "async",
      );
      const parsed = JSON.parse(stdout);
      let requiredRows = [{ name: "required", state: "pending" }];
      try {
        const checksOut = await guarded(
          "gh",
          [
            "pr",
            "checks",
            String(number),
            "--repo",
            targetRepo,
            "--required",
            "--json",
            "name,state",
          ],
          "async",
        );
        const parsedChecks = JSON.parse(checksOut);
        if (Array.isArray(parsedChecks) && parsedChecks.length > 0) {
          requiredRows = parsedChecks;
        }
      } catch {
        requiredRows = [{ name: "required", state: "pending" }];
      }
      const mapped = mapStatusChecks(parsed.statusCheckRollup, requiredRows);
      return {
        number: parsed.number ?? number,
        url: parsed.url,
        mergeable: parsed.mergeable,
        baseRef: parsed.baseRefName,
        requiredChecks: requiredChecksForMergeGate(mapped),
      };
    },

    /**
     * Sync — `landAtMergeGate` calls `gh.merge` synchronously.
     *
     * @param {string[]} args
     */
    merge(args) {
      if (!Array.isArray(args) || args.includes("--force")) {
        return { ok: false, error: "refusing --force" };
      }
      try {
        const number = args[2];
        const withRepo =
          args.includes("--repo") || typeof repo !== "string" ? args : [...args, "--repo", repo];
        guarded("gh", withRepo, "sync");
        const json = guarded(
          "gh",
          ["pr", "view", String(number), "--repo", repo, "--json", "mergeCommit"],
          "sync",
        );
        const sha = JSON.parse(String(json))?.mergeCommit?.oid;
        if (typeof sha !== "string" || sha.length === 0) {
          return { ok: false, error: "merge succeeded but SHA was missing" };
        }
        return { ok: true, sha };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "merge failed" };
      }
    },
  };
}

/**
 * @param {{
 *   job: { issueId: string, identifier?: string },
 *   linear: {
 *     getIssue: (id: string) => Promise<object | null>,
 *     listComments?: (issueId: string) => Promise<Array<{ id: string, body?: string }>>,
 *     updateWorkpad: (input: { issueId: string, body: string, commentId?: string }) => Promise<unknown>,
 *     setStatus: (input: { issueId: string, status: string }) => Promise<unknown>,
 *     commentIssue?: (input: { issueId: string, body: string }) => Promise<unknown>,
 *   },
 *   gh: {
 *     viewPr: (input: { number: number, repo?: string }) => Promise<object | null>,
 *     merge: (args: string[]) => { ok: boolean, sha?: string, error?: string },
 *   },
 *   lanes?: { integration: string, staging?: string, production?: string },
 *   worktree?: { reap?: (input: { identifier: string }) => Promise<unknown> },
 *   sleep?: (ms: number) => Promise<unknown>,
 *   unknownRetryAttempts?: number,
 *   unknownRetryMs?: number,
 * }} input
 */
export async function completeLand({
  job,
  linear,
  gh,
  lanes = LAND_LANES,
  worktree,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  unknownRetryAttempts = LAND_UNKNOWN_MERGEABLE_RETRIES,
  unknownRetryMs = LAND_UNKNOWN_RETRY_MS,
}) {
  const issue = await linear.getIssue(job.issueId);
  if (!issue || issue.status !== MERGE_PERMISSION_STATUS) {
    return {
      skipped: true,
      merged: false,
      nextStatus: issue?.status,
      reason: "land wakes only from Merging",
    };
  }

  const linked = pullRequestFromAttachments(issue.attachments);
  let pr = linked ? await gh.viewPr({ number: linked.number, repo: linked.repo }) : null;
  if (pr?.mergeable === "UNKNOWN" && linked) {
    for (let attempt = 0; attempt < unknownRetryAttempts; attempt += 1) {
      await sleep(unknownRetryMs);
      pr = await gh.viewPr({ number: linked.number, repo: linked.repo });
      if (pr?.mergeable !== "UNKNOWN") {
        break;
      }
    }
  }
  const gate = landAtMergeGate({
    issueStatus: issue.status,
    pr,
    lanes,
    gh,
  });

  const nextStatus = gate.merged ? MERGED_STATUS : MERGE_FAILURE_STATUS;
  const comments =
    typeof linear.listComments === "function" ? await linear.listComments(job.issueId) : [];
  const existing = comments.find((comment) => comment.body?.includes(WORKPAD_HEADING));
  const body = applyLandWorkpad(existing?.body, {
    sha: gate.sha,
    error: gate.merged ? undefined : gate.reason,
  });
  await linear.updateWorkpad({
    issueId: job.issueId,
    body,
    commentId: existing?.id,
  });
  const identifier =
    typeof job.identifier === "string" && job.identifier.length > 0
      ? job.identifier
      : issue.identifier;
  if (typeof linear.commentIssue === "function") {
    await linear.commentIssue({
      issueId: job.issueId,
      body: gate.merged
        ? landSuccessComment(identifier, gate.sha ?? "")
        : landFailComment(identifier, gate.reason ?? "merge failed"),
    });
  }
  await linear.setStatus({ issueId: job.issueId, status: nextStatus });

  if (gate.merged && typeof worktree?.reap === "function") {
    const identifier = job.identifier ?? job.issueId;
    await worktree.reap({ identifier });
  }

  return {
    merged: gate.merged,
    nextStatus,
    sha: gate.sha,
    reason: gate.reason,
    ghCalled: gate.ghCalled,
  };
}
