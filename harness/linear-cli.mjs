/**
 * Linear CLI adapter for KIT-52 dispatch.
 * Factory I/O is `linear api` (pinned @schpet/linear-cli), not Linear MCP.
 * The worker secret is LINEAR_CLI_API_KEY; the CLI subprocess sees LINEAR_API_KEY.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const TYPE_LABELS = ["Feature", "Bug", "Improvement"];
export const WORKPAD_HEADING = "## Agent Workpad";
export const IN_REVIEW_STATE = "In Review";

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

export const ISSUE_COMMENTS_QUERY = `query IssueComments($id: String!) {
  issue(id: $id) {
    comments(first: 50) { nodes { id body } }
  }
}`;

export const ISSUE_TEAM_STATES_QUERY = `query IssueTeamStates($id: String!) {
  issue(id: $id) {
    team {
      states(first: 30) { nodes { id name } }
    }
  }
}`;

export const COMMENT_UPDATE_MUTATION = `mutation CommentUpdate($id: String!, $body: String!) {
  commentUpdate(id: $id, input: { body: $body }) { success }
}`;

export const COMMENT_CREATE_MUTATION = `mutation CommentCreate($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) { success comment { id } }
}`;

export const ISSUE_UPDATE_STATE_MUTATION = `mutation IssueUpdateState($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) { success }
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

  const cliEnv = {
    ...process.env,
    ...env,
    LINEAR_API_KEY: typeof env.LINEAR_CLI_API_KEY === "string" ? env.LINEAR_CLI_API_KEY : "",
  };

  /**
   * @param {string} query
   * @param {object} variables
   */
  async function cli(query, variables) {
    return run("linear", ["api", query, "--variables-json", JSON.stringify(variables)], {
      env: cliEnv,
    });
  }

  return {
    /**
     * @param {string} id
     */
    async getIssue(id) {
      const stdout = await cli(WORKER_ISSUE_QUERY, { id });
      const parsed = parseJson(stdout);
      const raw = parsed?.data?.issue ?? parsed?.issue ?? null;
      return mapLinearApiIssue(raw);
    },

    /**
     * @param {string} issueId
     * @returns {Promise<Array<{ id: string, body?: string }>>}
     */
    async listComments(issueId) {
      const stdout = await cli(ISSUE_COMMENTS_QUERY, { id: issueId });
      const parsed = parseJson(stdout);
      const nodes = parsed?.data?.issue?.comments?.nodes;
      if (!Array.isArray(nodes)) {
        return [];
      }
      return nodes.filter((node) => typeof node?.id === "string");
    },

    /**
     * Update the existing ## Agent Workpad comment, or create one. Never a second workpad.
     *
     * @param {{ issueId: string, body: string, commentId?: string }} input
     */
    async updateWorkpad({ issueId, body, commentId }) {
      let targetId = commentId;
      if (typeof targetId !== "string") {
        const comments = await this.listComments(issueId);
        const existing = comments.find(
          (comment) => typeof comment.body === "string" && comment.body.includes(WORKPAD_HEADING),
        );
        targetId = existing?.id;
      }
      if (typeof targetId === "string") {
        await cli(COMMENT_UPDATE_MUTATION, { id: targetId, body });
        return { id: targetId, created: false };
      }
      const stdout = await cli(COMMENT_CREATE_MUTATION, { issueId, body });
      const parsed = parseJson(stdout);
      return { id: parsed?.data?.commentCreate?.comment?.id, created: true };
    },

    /**
     * @param {{ issueId: string, status: string }} input
     */
    async setStatus({ issueId, status }) {
      const stdout = await cli(ISSUE_TEAM_STATES_QUERY, { id: issueId });
      const parsed = parseJson(stdout);
      const states = parsed?.data?.issue?.team?.states?.nodes;
      const match = Array.isArray(states)
        ? states.find((state) => state?.name === status)
        : undefined;
      if (typeof match?.id !== "string") {
        throw new Error(`Linear workflow state not found: ${status}`);
      }
      await cli(ISSUE_UPDATE_STATE_MUTATION, { id: issueId, stateId: match.id });
      return { issueId, status };
    },
  };
}

/**
 * @param {string} stdout
 */
function parseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}
