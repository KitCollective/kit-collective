/**
 * Factory checker Pi extension (KIT-56, KIT-127).
 * Blocks write/edit/general bash; registers pinned Linear CLI and comment-only gh_cli host tools.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  assertGhCliActionAllowed,
  SLOP_REVIEW_MARKER,
  slopCommentBody,
  splitRepo,
} from "./slop-review.mjs";

const execFileAsync = promisify(execFile);

const BLOCKED_TOOLS = new Set(["write", "edit"]);
/** Readonly git only — no `gh` via bash (use gh_cli host tool; harness owns check waits). */
const READONLY_SHELL = [/^git\s+(rev-parse|diff|log|show|status)\b/i];
const SLOP_AGENT_MEMORY_EXCLUDED_TOOLS_ENV = "SLOP_AGENT_MEMORY_EXCLUDED_TOOLS";
const SLOP_AGENT_PI_ARGS_ENV = "SLOP_AGENT_PI_ARGS";

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

const COMMENT_UPDATE_MUTATION = `mutation CommentUpdate($id: String!, $body: String!) {
  commentUpdate(id: $id, input: { body: $body }) { success }
}`;

const COMMENT_CREATE_MUTATION = `mutation CommentCreate($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) {
    comment { id }
  }
}`;

const ISSUE_COMMENTS_QUERY = `query IssueComments($id: String!) {
  issue(id: $id) {
    comments(first: 50) { nodes { id body } }
  }
}`;

const WORKPAD_HEADING = "## Agent Workpad";

function shellCommand(input: Record<string, unknown>): string {
  if (typeof input.command === "string") {
    return input.command;
  }
  if (typeof input.cmd === "string") {
    return input.cmd;
  }
  return "";
}

function isReadonlyShell(command: string): boolean {
  const trimmed = command.trim();
  return READONLY_SHELL.some((pattern) => pattern.test(trimmed));
}

async function linearApi(query: string, variables: Record<string, unknown>): Promise<string> {
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: Pi worker injects Linear CLI secrets at spawn.
  const apiKey = process.env.LINEAR_API_KEY ?? process.env.LINEAR_CLI_API_KEY ?? "";
  const { stdout } = await execFileAsync(
    "linear",
    ["api", query, "--variables-json", JSON.stringify(variables)],
    {
      env: { ...process.env, LINEAR_API_KEY: apiKey },
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 2_000_000,
    },
  );
  return stdout;
}

function slopSpawnEnvWired(): boolean {
  const excluded = process.env[SLOP_AGENT_MEMORY_EXCLUDED_TOOLS_ENV];
  const piArgs = process.env[SLOP_AGENT_PI_ARGS_ENV];
  return (
    typeof excluded === "string" &&
    excluded.length > 0 &&
    typeof piArgs === "string" &&
    piArgs.length > 0
  );
}

function subagentTargetAgent(input: Record<string, unknown>): string {
  if (typeof input.agent === "string") {
    return input.agent.trim();
  }
  return "";
}

function requireGithubPr(): { repo: string; number: number } {
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: harness sets GitHub PR env for factory-checker.
  const repo = process.env.GITHUB_PR_REPO ?? "";
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: harness sets GitHub PR env for factory-checker.
  const numberRaw = process.env.GITHUB_PR_NUMBER ?? "";
  const number = Number(numberRaw);
  if (typeof repo !== "string" || repo.length === 0 || !Number.isFinite(number) || number <= 0) {
    throw new Error("GITHUB_PR_REPO and GITHUB_PR_NUMBER are required for gh_cli");
  }
  return { repo, number };
}

async function ghApi(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("gh", args, {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 2_000_000,
  });
  return stdout;
}

async function loadHeadRefOid(repo: string, number: number): Promise<string> {
  const { owner, name } = splitRepo(repo);
  const stdout = await ghApi([
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
  // SAFETY: gh_cli GraphQL query returns JSON with repository.pullRequest.headRefOid.
  const parsed = JSON.parse(stdout) as {
    data?: { repository?: { pullRequest?: { headRefOid?: string } } };
  };
  const headRefOid = parsed.data?.repository?.pullRequest?.headRefOid;
  if (typeof headRefOid !== "string" || headRefOid.length === 0) {
    throw new Error("gh_cli could not resolve PR headRefOid");
  }
  return headRefOid;
}

export default function factoryCheckerTools(pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    const name = event.toolName.toLowerCase();
    if (name === "subagent") {
      // SAFETY: pi tool_call input is a string-keyed object map for subagent delegation.
      const input = event.input as Record<string, unknown>;
      if (subagentTargetAgent(input) === "slop" && !slopSpawnEnvWired()) {
        return {
          block: true,
          reason: "factory-checker: Slop child spawn env missing (applySlopAgentSpawnEnv)",
        };
      }
    }
    if (BLOCKED_TOOLS.has(name)) {
      return { block: true, reason: "factory-checker: write/edit denied" };
    }
    if (name === "bash" || name === "shell") {
      // SAFETY: pi tool_call input is a string-keyed object map for bash/shell commands.
      const command = shellCommand(event.input as Record<string, unknown>);
      if (!isReadonlyShell(command)) {
        return { block: true, reason: "factory-checker: general bash denied" };
      }
    }
    return undefined;
  });

  pi.registerTool({
    name: "linear_cli",
    label: "Linear CLI",
    description:
      "Update the existing ## Agent Workpad comment via the pinned Linear CLI host tool. Pass the full workpad body.",
    parameters: Type.Object({
      body: Type.String({ description: "Full workpad markdown including ## Agent Workpad" }),
    }),
    async execute(_toolCallId, params) {
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: harness sets LINEAR_ISSUE_ID for factory-checker.
      const issueId = process.env.LINEAR_ISSUE_ID;
      if (typeof issueId !== "string" || issueId.length === 0) {
        throw new Error("LINEAR_ISSUE_ID is required for linear_cli");
      }
      // SAFETY: TypeBox parameters schema requires body to be a string.
      const body = params.body as string;
      const stdout = await linearApi(ISSUE_COMMENTS_QUERY, { id: issueId });
      // SAFETY: linear_cli reads JSON from the pinned IssueComments GraphQL query.
      const parsed = JSON.parse(stdout) as {
        data?: { issue?: { comments?: { nodes?: Array<{ id?: string; body?: string }> } } };
      };
      const nodes = parsed.data?.issue?.comments?.nodes ?? [];
      const existing = nodes.find(
        (node) => typeof node.body === "string" && node.body.includes(WORKPAD_HEADING),
      );
      if (typeof existing?.id === "string") {
        await linearApi(COMMENT_UPDATE_MUTATION, { id: existing.id, body });
        return { content: [{ type: "text", text: `Updated workpad comment ${existing.id}` }] };
      }
      await linearApi(COMMENT_CREATE_MUTATION, { issueId, body });
      return { content: [{ type: "text", text: "Created workpad comment" }] };
    },
  });

  pi.registerTool({
    name: "gh_cli",
    label: "GitHub CLI (comment-only)",
    description:
      "Post inline Slop review comments or resolve factory-checker Slop threads on the linked PR. Cannot merge or approve.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("comment"),
        Type.Literal("resolve_thread"),
        Type.Literal("list_threads"),
      ]),
      path: Type.Optional(Type.String({ description: "File path for inline comment" })),
      line: Type.Optional(Type.Number({ description: "Line number for inline comment" })),
      message: Type.Optional(Type.String({ description: "Slop finding message (comment action)" })),
      threadId: Type.Optional(Type.String({ description: "Review thread id (resolve_thread)" })),
    }),
    async execute(_toolCallId, params) {
      // SAFETY: TypeBox parameters schema constrains action and optional fields.
      const action = params.action as string;
      assertGhCliActionAllowed(action);
      const { repo, number } = requireGithubPr();
      const { owner, name } = splitRepo(repo);

      if (action === "list_threads") {
        const stdout = await ghApi([
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
        // SAFETY: gh_cli GraphQL query returns JSON with repository.pullRequest.reviewThreads.nodes.
        const parsed = JSON.parse(stdout) as {
          data?: {
            repository?: {
              pullRequest?: {
                reviewThreads?: {
                  nodes?: Array<{
                    id?: string;
                    isResolved?: boolean;
                    comments?: { nodes?: Array<{ body?: string; path?: string; line?: number }> };
                  }>;
                };
              };
            };
          };
        };
        const nodes = parsed.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
        const threads = nodes
          .map((node) => {
            const comment = node.comments?.nodes?.[0];
            if (!comment?.body?.includes(SLOP_REVIEW_MARKER)) {
              return null;
            }
            return {
              id: node.id,
              isResolved: node.isResolved === true,
              path: comment.path,
              line: comment.line,
              body: comment.body,
            };
          })
          .filter(Boolean);
        return { content: [{ type: "text", text: JSON.stringify(threads, null, 2) }] };
      }

      if (action === "resolve_thread") {
        // SAFETY: TypeBox parameters schema requires threadId when action is resolve_thread.
        const threadId = params.threadId as string | undefined;
        if (typeof threadId !== "string" || threadId.length === 0) {
          throw new Error("resolve_thread requires threadId");
        }
        const listStdout = await ghApi([
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
        // SAFETY: gh_cli GraphQL query returns JSON with repository.pullRequest.reviewThreads.nodes.
        const listParsed = JSON.parse(listStdout) as {
          data?: {
            repository?: {
              pullRequest?: {
                reviewThreads?: {
                  nodes?: Array<{
                    id?: string;
                    comments?: { nodes?: Array<{ body?: string }> };
                  }>;
                };
              };
            };
          };
        };
        const slopThreadIds = new Set(
          (listParsed.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [])
            .filter((node) => node.comments?.nodes?.[0]?.body?.includes(SLOP_REVIEW_MARKER))
            .map((node) => node.id)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
        );
        if (!slopThreadIds.has(threadId)) {
          throw new Error(
            `resolve_thread refused: not a ${SLOP_REVIEW_MARKER} thread (${threadId})`,
          );
        }
        const stdout = await ghApi([
          "api",
          "graphql",
          "-f",
          `query=${RESOLVE_THREAD_MUTATION}`,
          "-f",
          `threadId=${threadId}`,
        ]);
        return { content: [{ type: "text", text: stdout.trim() }] };
      }

      // SAFETY: TypeBox parameters schema requires path when action is comment.
      const path = params.path as string | undefined;
      // SAFETY: TypeBox parameters schema requires line when action is comment.
      const line = params.line as number | undefined;
      // SAFETY: TypeBox parameters schema requires message when action is comment.
      const message = params.message as string | undefined;
      if (typeof path !== "string" || path.length === 0) {
        throw new Error("comment requires path");
      }
      if (typeof line !== "number" || !Number.isFinite(line) || line <= 0) {
        throw new Error("comment requires line");
      }
      if (typeof message !== "string" || message.length === 0) {
        throw new Error("comment requires message");
      }
      const commitId = await loadHeadRefOid(repo, number);
      const body = slopCommentBody({ path, lineNumber: line, message });
      const apiPath = `/repos/${owner}/${name}/pulls/${number}/comments`;
      const stdout = await ghApi([
        "api",
        "--method",
        "POST",
        apiPath,
        "-f",
        `body=${body}`,
        "-f",
        `commit_id=${commitId}`,
        "-f",
        `path=${path}`,
        "-F",
        `line=${line}`,
        "-f",
        "side=RIGHT",
      ]);
      return { content: [{ type: "text", text: stdout.trim() }] };
    },
  });
}
