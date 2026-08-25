/**
 * Linear CLI adapter for KIT-52 dispatch and KIT-55 planner claims.
 * Factory I/O is `linear api` (pinned @schpet/linear-cli), not Linear MCP.
 * The worker secret is LINEAR_CLI_API_KEY; the CLI subprocess sees LINEAR_API_KEY.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const TYPE_LABELS = ["Feature", "Bug", "Improvement"];

export const FORBIDDEN_PLANNER_STATES = [
  "In Review",
  "Ready for merge",
  "Merging",
  "Done",
  "Parked",
  "Canceled",
];

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

export const PLANNER_USER_QUERY = `query PlannerUser($id: String!) {
  user(id: $id) { id name }
}`;

export const PLANNER_DISPATCH_QUERY = `query PlannerDispatch($teamKey: String!) {
  implementingState: workflowStates(
    first: 1
    filter: { name: { eq: "Implementing" }, team: { key: { eq: $teamKey } } }
  ) {
    nodes { id name }
  }
  backlog: issues(
    first: 100
    filter: {
      team: { key: { eq: $teamKey } }
      state: { name: { eq: "Backlog" } }
    }
  ) {
    nodes {
      id
      identifier
      description
      priority
      createdAt
      state { name type }
      labels(first: 50) { nodes { name } }
      assignee { id name }
      delegate { id name }
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
  }
}`;

export const PLANNER_CLAIM_MUTATION = `mutation PlannerClaim($id: String!, $stateId: String!, $delegateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId, delegateId: $delegateId }) {
    success
    issue {
      id
      assignee { id name }
      delegate { id name }
      state { name }
    }
  }
}`;

export const PLANNER_COMMENT_MUTATION = `mutation PlannerComment($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) { success comment { id } }
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
 * @param {unknown} raw
 */
export function mapPlannerIssue(raw) {
  const base = mapLinearApiIssue(raw);
  if (!base || raw === null || typeof raw !== "object") {
    return null;
  }
  const issue = raw;
  const delegateId = issue.delegate?.id;
  return {
    ...base,
    priority: typeof issue.priority === "number" ? issue.priority : 0,
    createdAt: typeof issue.createdAt === "string" ? issue.createdAt : "",
    description: typeof issue.description === "string" ? issue.description : "",
    assignee:
      typeof issue.assignee?.id === "string"
        ? { id: issue.assignee.id, name: issue.assignee.name }
        : null,
    delegate:
      typeof base.delegate?.name === "string"
        ? {
            name: base.delegate.name,
            ...(typeof delegateId === "string" ? { id: delegateId } : {}),
          }
        : null,
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
     * @param {string} id
     */
    async lookupUser(id) {
      const stdout = await cli(PLANNER_USER_QUERY, { id });
      const user = parseJson(stdout)?.data?.user;
      if (typeof user?.id !== "string") {
        return null;
      }
      return { id: user.id, name: typeof user.name === "string" ? user.name : "" };
    },

    /**
     * @param {{ teamKey?: string }} [input]
     */
    async listDispatch({ teamKey = "KIT" } = {}) {
      const stdout = await cli(PLANNER_DISPATCH_QUERY, { teamKey });
      const data = parseJson(stdout)?.data;
      const implementingState = data?.implementingState?.nodes?.[0] ?? null;
      const issues = Array.isArray(data?.backlog?.nodes)
        ? data.backlog.nodes.map((node) => mapPlannerIssue(node)).filter(Boolean)
        : [];
      return { implementingState, issues };
    },

    /**
     * Claim is Implementing + Pi delegate only. Never assignee. Never a forbidden status.
     *
     * @param {{ id: string, stateId: string, delegateId: string }} input
     */
    async claimIssue({ id, stateId, delegateId }) {
      if (typeof delegateId !== "string" || delegateId.length === 0) {
        throw new Error("planner claim requires Pi delegateId");
      }
      const stdout = await cli(PLANNER_CLAIM_MUTATION, { id, stateId, delegateId });
      const issue = parseJson(stdout)?.data?.issueUpdate?.issue;
      if (!issue) {
        return null;
      }
      return {
        id: issue.id,
        assignee:
          typeof issue.assignee?.id === "string"
            ? { id: issue.assignee.id, name: issue.assignee.name }
            : null,
        delegate:
          typeof issue.delegate?.id === "string"
            ? { id: issue.delegate.id, name: issue.delegate.name }
            : null,
        status: issue.state?.name,
      };
    },

    /**
     * @param {{ issueId: string, body: string }} input
     */
    async commentIssue({ issueId, body }) {
      await cli(PLANNER_COMMENT_MUTATION, { issueId, body });
    },
  };
}
