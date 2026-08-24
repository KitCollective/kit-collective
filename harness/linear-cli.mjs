/**
 * Linear CLI adapter for KIT-52 dispatch.
 * Factory I/O is `linear api` (pinned @schpet/linear-cli), not Linear MCP.
 * The worker secret is LINEAR_CLI_API_KEY; the CLI subprocess sees LINEAR_API_KEY.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const TYPE_LABELS = ["Feature", "Bug", "Improvement"];

export const WORKER_ISSUE_QUERY = `query WorkerIssue($id: String!) {
  issue(id: $id) {
    id
    identifier
    state { name type }
    labels(first: 50) { nodes { name } }
    delegate { name }
    inverseRelations(first: 100) {
      nodes {
        type
        issue {
          identifier
          state { name type }
        }
      }
    }
  }
}`;

/**
 * @param {unknown} raw
 * @returns {object | null}
 */
export function mapLinearApiIssue(raw) {
  if (raw === null || typeof raw !== "object") {
    return null;
  }
  const issue = raw;
  if (typeof issue.id !== "string" || typeof issue.identifier !== "string") {
    return null;
  }
  const labels = Array.isArray(issue.labels?.nodes)
    ? issue.labels.nodes
        .map((node) => (typeof node?.name === "string" ? node.name : undefined))
        .filter((name) => typeof name === "string")
    : [];
  const linearType = TYPE_LABELS.find((name) => labels.includes(name));
  const blockedBy = Array.isArray(issue.inverseRelations?.nodes)
    ? issue.inverseRelations.nodes
        .filter((rel) => rel?.type === "blocks")
        .map((rel) => ({
          status: rel.issue?.state?.name,
          statusType: rel.issue?.state?.type,
        }))
    : [];
  const delegateName = issue.delegate?.name;
  return {
    id: issue.id,
    identifier: issue.identifier,
    status: issue.state?.name,
    labels,
    linearType,
    blockedBy,
    delegate: typeof delegateName === "string" ? { name: delegateName } : null,
  };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   runCommand?: (command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => Promise<string>,
 * }} [deps]
 */
export function createLinearCliClient({ env = process.env, runCommand } = {}) {
  const run =
    runCommand ??
    (async (command, args, options) => {
      const { stdout } = await execFile(command, args, {
        env: options.env,
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 2_000_000,
      });
      return stdout;
    });

  return {
    /**
     * @param {string} id
     */
    async getIssue(id) {
      const cliKey = env.LINEAR_CLI_API_KEY;
      const stdout = await run(
        "linear",
        ["api", WORKER_ISSUE_QUERY, "--variables-json", JSON.stringify({ id })],
        {
          env: {
            ...process.env,
            ...env,
            LINEAR_API_KEY: typeof cliKey === "string" ? cliKey : "",
          },
        },
      );
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        return null;
      }
      const raw = parsed?.data?.issue ?? parsed?.issue ?? null;
      return mapLinearApiIssue(raw);
    },
  };
}
