/**
 * Factory checker Pi extension (KIT-56).
 * Blocks write/edit/general bash; registers pinned Linear CLI as linear_cli host tool.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const execFileAsync = promisify(execFile);

const BLOCKED_TOOLS = new Set(["write", "edit"]);
const READONLY_SHELL = [/^git\s+(rev-parse|diff|log)\b/i, /^gh\s+(pr\s+(view|checks|diff)|api)\b/i];

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

export default function factoryCheckerTools(pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    const name = event.toolName.toLowerCase();
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
}
