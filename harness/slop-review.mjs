/**
 * Slop inline GitHub review threads (KIT-127).
 * Comment-only gh seam — no merge, no approve. Fake `runCommand` in tests.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_GH_REPO } from "./gh-cli.mjs";
import { gitArgvContainsSecret, remoteGitChildEnv } from "./worktree.mjs";

const execFile = promisify(execFileCb);

export const SLOP_REVIEW_MARKER = "[factory-checker/slop]";
export const SLOP_FINDING_PREFIX = /^-\s*Slop\//i;

const PATH_LINE_RE = /([\w./-]+\.\w+):(\d+)\b/;
const PATH_IN_RE = /(?:\bin\s+|\bat\s+)([\w./-]+\.\w+)\b/i;
const PATH_TRAILING_RE = /([\w./-]+\.\w+)\s*$/;

const REVIEW_THREADS_QUERY = `query SlopReviewThreads($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      headRefOid
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes { body path line originalLine }
          }
        }
      }
    }
  }
}`;

const RESOLVE_THREAD_MUTATION = `mutation ResolveSlopThread($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}`;

/**
 * @param {string} repo
 * @returns {{ owner: string, name: string }}
 */
export function splitRepo(repo) {
  const [owner, name] = String(repo).split("/");
  if (!owner || !name) {
    throw new Error(`invalid repo: ${repo}`);
  }
  return { owner, name };
}

/**
 * @param {string} line
 * @returns {{ raw: string, path: string, lineNumber: number, message: string } | null}
 */
export function parseSlopFindingLine(line) {
  const match = line.match(/^-\s*Slop\/\s*(.+)$/i);
  if (!match) {
    return null;
  }
  const message = match[1].trim();
  const pathLine = message.match(PATH_LINE_RE);
  if (pathLine) {
    return {
      raw: line,
      path: pathLine[1],
      lineNumber: Number(pathLine[2]),
      message,
    };
  }
  const inPath = message.match(PATH_IN_RE);
  if (inPath) {
    return {
      raw: line,
      path: inPath[1],
      lineNumber: 1,
      message,
    };
  }
  const trailing = message.match(PATH_TRAILING_RE);
  if (trailing) {
    return {
      raw: line,
      path: trailing[1],
      lineNumber: 1,
      message,
    };
  }
  return null;
}

const REVIEW_FEEDBACK_BLOCK = /(^|\n)### Review feedback\n([\s\S]*?)(?=\n### |$)/;

/**
 * @param {string | undefined} workpadBody
 * @returns {string[]}
 */
export function slopFeedbackLines(workpadBody) {
  if (typeof workpadBody !== "string") {
    return [];
  }
  const match = workpadBody.match(REVIEW_FEEDBACK_BLOCK);
  const section = match ? match[2].trim() : "";
  if (section.length === 0) {
    return [];
  }
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * @param {string | undefined} workpadBody
 * @returns {Array<{ raw: string, path: string, lineNumber: number, message: string }>}
 */
export function parseSlopFindings(workpadBody) {
  return slopFeedbackLines(workpadBody)
    .filter((line) => SLOP_FINDING_PREFIX.test(line))
    .map((line) => parseSlopFindingLine(line))
    .filter((finding) => finding !== null);
}

/**
 * @param {{ path: string, lineNumber?: number, message: string }} finding
 * @returns {string}
 */
export function slopCommentBody(finding) {
  return `${SLOP_REVIEW_MARKER}\n${finding.message}`;
}

/**
 * @param {string | undefined} body
 * @returns {boolean}
 */
export function isSlopReviewComment(body) {
  return typeof body === "string" && body.includes(SLOP_REVIEW_MARKER);
}

/**
 * @param {{ path?: string, line?: number, originalLine?: number }} comment
 * @returns {string}
 */
export function slopThreadFingerprint(comment) {
  const path = typeof comment?.path === "string" ? comment.path : "";
  const line =
    typeof comment?.line === "number"
      ? comment.line
      : typeof comment?.originalLine === "number"
        ? comment.originalLine
        : 1;
  return `${path}:${line}`;
}

/**
 * @param {string} action
 */
export function assertGhCliActionAllowed(action) {
  const normalized = action.trim().toLowerCase();
  if (normalized === "merge" || normalized === "approve") {
    throw new Error("gh_cli cannot merge or approve pull requests");
  }
  const allowed = new Set(["comment", "resolve_thread", "list_threads"]);
  if (!allowed.has(normalized)) {
    throw new Error(`gh_cli action not allowed: ${action}`);
  }
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   repo?: string,
 *   runCommand?: (command: string, args: string[], options: { env?: NodeJS.ProcessEnv }) => Promise<string>,
 * }} [deps]
 */
export function createSlopReviewGh({ env = process.env, repo = DEFAULT_GH_REPO, runCommand } = {}) {
  const invoke =
    runCommand ??
    (async (command, args, options) => {
      const childEnv = remoteGitChildEnv({ ...process.env, ...env, ...options.env });
      if (gitArgvContainsSecret(args, childEnv)) {
        throw new Error("git argv must not contain GH_TOKEN");
      }
      const { stdout } = await execFile(command, args, {
        encoding: "utf8",
        timeout: 120_000,
        env: childEnv,
      });
      return stdout;
    });

  /**
   * @param {string} command
   * @param {string[]} args
   */
  async function runGh(command, args) {
    return invoke(command, args, { env });
  }

  /**
   * @param {{ number: number, repo?: string }} input
   */
  async function loadReviewContext({ number, repo: repoOverride }) {
    const targetRepo = repoOverride ?? repo;
    const { owner, name } = splitRepo(targetRepo);
    const stdout = await runGh("gh", [
      "api",
      "graphql",
      "-f",
      `query=${REVIEW_THREADS_QUERY}`,
      "-f",
      `owner=${owner}`,
      "-f",
      `name=${name}`,
      "-F",
      `number=${number}`,
    ]);
    const parsed = JSON.parse(stdout);
    const pull = parsed?.data?.repository?.pullRequest;
    const nodes = pull?.reviewThreads?.nodes ?? [];
    const threads = nodes
      .map((node) => {
        const comment = node?.comments?.nodes?.[0];
        if (!comment || !isSlopReviewComment(comment.body)) {
          return null;
        }
        return {
          id: node.id,
          isResolved: node.isResolved === true,
          fingerprint: slopThreadFingerprint(comment),
          path: comment.path,
          line: comment.line ?? comment.originalLine ?? 1,
          body: comment.body,
        };
      })
      .filter(Boolean);
    return {
      headRefOid: typeof pull?.headRefOid === "string" ? pull.headRefOid : "",
      threads,
    };
  }

  return {
    /**
     * @param {{ repo?: string, number: number, path: string, line: number, body: string, commitId?: string }} input
     */
    async postInlineComment({ repo: repoOverride, number, path, line, body, commitId }) {
      const targetRepo = repoOverride ?? repo;
      const { owner, name } = splitRepo(targetRepo);
      let commit = commitId;
      if (typeof commit !== "string" || commit.length === 0) {
        const ctx = await loadReviewContext({ number, repo: targetRepo });
        commit = ctx.headRefOid;
      }
      if (typeof commit !== "string" || commit.length === 0) {
        throw new Error("postInlineComment requires commitId");
      }
      const apiPath = `/repos/${owner}/${name}/pulls/${number}/comments`;
      const stdout = await runGh("gh", [
        "api",
        "--method",
        "POST",
        apiPath,
        "-f",
        `body=${body}`,
        "-f",
        `commit_id=${commit}`,
        "-f",
        `path=${path}`,
        "-F",
        `line=${line}`,
        "-f",
        "side=RIGHT",
      ]);
      return JSON.parse(stdout);
    },

    /**
     * @param {{ repo?: string, number: number }} input
     */
    async listSlopThreads(input) {
      const ctx = await loadReviewContext(input);
      return ctx.threads;
    },

    /**
     * @param {{ repo?: string, number: number, threadId: string }} input
     */
    async resolveReviewThread({ repo: repoOverride, number, threadId }) {
      const targetRepo = repoOverride ?? repo;
      const { owner, name } = splitRepo(targetRepo);
      const stdout = await runGh("gh", [
        "api",
        "graphql",
        "-f",
        `query=${RESOLVE_THREAD_MUTATION}`,
        "-f",
        `threadId=${threadId}`,
      ]);
      const parsed = JSON.parse(stdout);
      const resolved = parsed?.data?.resolveReviewThread?.thread?.isResolved;
      if (resolved !== true) {
        throw new Error(
          `resolveReviewThread failed for ${owner}/${name}#${number} thread ${threadId}`,
        );
      }
      return { threadId, isResolved: true };
    },

    /**
     * @param {{
     *   repo?: string,
     *   number: number,
     *   workpadBody?: string,
     *   findings?: Array<{ path: string, lineNumber: number, message: string }>,
     * }} input
     */
    async syncSlopReviewThreads(input) {
      const findings =
        Array.isArray(input.findings) && input.findings.length > 0
          ? input.findings
          : parseSlopFindings(input.workpadBody);
      const ctx = await loadReviewContext(input);
      const active = new Set(findings.map((f) => `${f.path}:${f.lineNumber}`));
      const posted = [];

      for (const finding of findings) {
        const fingerprint = `${finding.path}:${finding.lineNumber}`;
        const existing = ctx.threads.find(
          (thread) => !thread.isResolved && thread.fingerprint === fingerprint,
        );
        if (existing) {
          continue;
        }
        await this.postInlineComment({
          repo: input.repo,
          number: input.number,
          path: finding.path,
          line: finding.lineNumber,
          body: slopCommentBody(finding),
          commitId: ctx.headRefOid,
        });
        posted.push(fingerprint);
      }

      const resolved = [];
      for (const thread of ctx.threads) {
        if (thread.isResolved || active.has(thread.fingerprint)) {
          continue;
        }
        await this.resolveReviewThread({
          repo: input.repo,
          number: input.number,
          threadId: thread.id,
        });
        resolved.push(thread.fingerprint);
      }

      return { posted, resolved };
    },

    approve() {
      throw new Error("gh_cli cannot approve pull requests");
    },

    merge() {
      throw new Error("gh_cli cannot merge pull requests");
    },
  };
}
