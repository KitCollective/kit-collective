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
  ghMergeArgsIncludeStrategy,
  LAND_UNKNOWN_MERGEABLE_RETRIES,
  LAND_UNKNOWN_RETRY_MS,
  landAtMergeGate,
  MERGE_FAILURE_STATUS,
  MERGE_PERMISSION_STATUS,
  MERGED_STATUS,
} from "../scripts/lib/land-policy.mjs";
import {
  logFactoryExitDone,
  logFactoryExitStart,
  logFactoryGatePoll,
} from "./factory-exit-log.mjs";
import { mapStatusChecks } from "./gh-cli.mjs";
import { requiredChecksGreen, selectRequiredChecks } from "./implement-exit.mjs";
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
 * @param {string | undefined} url
 * @returns {{ number: number, repo: string, url: string, title?: string } | null}
 */
export function parsePullRequestAttachment(url, title) {
  if (typeof url !== "string") {
    return null;
  }
  const match = url.match(GITHUB_PULL);
  if (!match) {
    return null;
  }
  const parsed = {
    repo: match[1],
    number: Number(match[2]),
    url: `https://github.com/${match[1]}/pull/${match[2]}`,
  };
  if (typeof title === "string" && title.length > 0) {
    parsed.title = title;
  }
  return parsed;
}

/**
 * @param {Array<{ url?: string, title?: string }> | undefined} attachments
 * @returns {Array<{ number: number, repo: string, url: string, title?: string }>}
 */
export function listPullRequestsFromAttachments(attachments) {
  if (!Array.isArray(attachments)) {
    return [];
  }
  /** @type {Array<{ number: number, repo: string, url: string, title?: string }>} */
  const candidates = [];
  for (const attachment of attachments) {
    const parsed = parsePullRequestAttachment(attachment?.url, attachment?.title);
    if (parsed) {
      candidates.push(parsed);
    }
  }
  return candidates;
}

/**
 * @param {string | undefined} title
 * @param {string | undefined} identifier
 */
function titleMatchesIssueIdentifier(title, identifier) {
  if (typeof title !== "string" || typeof identifier !== "string") {
    return false;
  }
  return title.toUpperCase().includes(identifier.toUpperCase());
}

/**
 * Rank pull-request candidates for an issue. Higher wins.
 *
 * @param {{ number: number, title?: string }} candidate
 * @param {{ identifier?: string, states?: Map<number, { state?: string, mergeable?: string }> }} ctx
 */
export function rankPullRequestCandidate(candidate, ctx) {
  const state = ctx.states?.get(candidate.number);
  let rank = candidate.number;
  if (state?.state === "OPEN") {
    rank += 1_000_000;
  }
  if (state?.state === "MERGED" || state?.state === "CLOSED") {
    rank -= 500_000;
  }
  if (titleMatchesIssueIdentifier(candidate.title, ctx.identifier)) {
    rank += 500_000;
  }
  if (state?.mergeable === "MERGEABLE") {
    rank += 10_000;
  }
  if (state?.mergeable === "UNKNOWN") {
    rank -= 5_000;
  }
  if (state?.mergeable === "CONFLICTING") {
    rank -= 20_000;
  }
  return rank;
}

/**
 * Pick the best linked PR from Linear attachments.
 *
 * @param {Array<{ url?: string, title?: string }> | undefined} attachments
 * @param {{ identifier?: string, states?: Map<number, { state?: string, mergeable?: string }> }} [options]
 * @returns {{ number: number, repo: string, url: string, title?: string } | null}
 */
export function selectPullRequestFromAttachments(attachments, options = {}) {
  const candidates = listPullRequestsFromAttachments(attachments);
  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  const ctx = {
    identifier: options.identifier,
    states: options.states,
  };
  return [...candidates].sort(
    (left, right) => rankPullRequestCandidate(right, ctx) - rankPullRequestCandidate(left, ctx),
  )[0];
}

/**
 * @param {{
 *   attachments: Array<{ url?: string, title?: string }> | undefined,
 *   identifier?: string,
 *   gh: { viewPr: (input: { number: number, repo?: string }) => Promise<object | null> },
 * }} input
 * @returns {Promise<{ linked: { number: number, repo: string, url: string, title?: string }, skipped: Array<{ number: number, repo: string, url: string, title?: string }> } | null>}
 */
export async function resolveLinkedPullRequest({ attachments, identifier, gh }) {
  const candidates = listPullRequestsFromAttachments(attachments);
  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length === 1) {
    return { linked: candidates[0], skipped: [] };
  }
  /** @type {Map<number, { state?: string, mergeable?: string }>} */
  const states = new Map();
  await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const pr = await gh.viewPr({ number: candidate.number, repo: candidate.repo });
        states.set(candidate.number, {
          state: typeof pr?.state === "string" ? pr.state : undefined,
          mergeable: typeof pr?.mergeable === "string" ? pr.mergeable : undefined,
        });
      } catch {
        states.set(candidate.number, { state: "UNKNOWN", mergeable: "UNKNOWN" });
      }
    }),
  );
  const linked = selectPullRequestFromAttachments(attachments, { identifier, states });
  if (!linked) {
    return null;
  }
  const skipped = candidates.filter((candidate) => candidate.number !== linked.number);
  return { linked, skipped };
}

/**
 * @param {Array<{ url?: string, title?: string }> | undefined} attachments
 * @param {{ identifier?: string, states?: Map<number, { state?: string, mergeable?: string }> }} [options]
 * @returns {{ number: number, repo: string, url: string, title?: string } | null}
 */
export function pullRequestFromAttachments(attachments, options = {}) {
  return selectPullRequestFromAttachments(attachments, options);
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
          "number,url,mergeable,baseRefName,state,statusCheckRollup",
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
        state: parsed.state,
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
      if (!ghMergeArgsIncludeStrategy(args)) {
        return {
          ok: false,
          error: "gh pr merge requires --merge, --squash, or --rebase",
        };
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

  const linkedResolution = await resolveLinkedPullRequest({
    attachments: issue.attachments,
    identifier:
      typeof job.identifier === "string" && job.identifier.length > 0
        ? job.identifier
        : issue.identifier,
    gh,
  });
  const linked = linkedResolution?.linked ?? null;
  const identifier =
    typeof job.identifier === "string" && job.identifier.length > 0
      ? job.identifier
      : issue.identifier;
  if (linked) {
    logFactoryExitStart({
      role: "land",
      identifier,
      phase: "land-exit",
      linked,
      skipped: linkedResolution?.skipped ?? [],
    });
  }
  let pr = linked ? await gh.viewPr({ number: linked.number, repo: linked.repo }) : null;
  if (pr?.mergeable === "UNKNOWN" && linked) {
    for (let attempt = 1; attempt <= unknownRetryAttempts; attempt += 1) {
      logFactoryGatePoll({
        role: "land",
        identifier,
        phase: "land-exit",
        attempt,
        pr,
        checksGreen: requiredChecksGreen(pr?.requiredChecks ?? pr?.checks),
      });
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
  logFactoryExitDone({
    role: "land",
    identifier,
    phase: "land-exit",
    passed: gate.merged,
    nextStatus,
    reason: gate.merged ? `merged ${gate.sha ?? ""}`.trim() : gate.reason,
  });

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
