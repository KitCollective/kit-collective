/**
 * Linear CLI adapter for KIT-52 dispatch and KIT-55 planner claims.
 * Factory I/O is `linear api` (pinned @schpet/linear-cli), not Linear MCP.
 * The worker secret is LINEAR_CLI_API_KEY; the CLI subprocess sees LINEAR_API_KEY.
 */
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { createActorTokenProvider, isLinearUnauthorized } from "./linear-actor-token.mjs";

const execFile = promisify(execFileCb);

const TYPE_LABELS = ["Feature", "Bug", "Improvement"];
export const WORKPAD_HEADING = "## Agent Workpad";
export const IN_REVIEW_STATE = "In Review";

export const FORBIDDEN_PLANNER_STATES = [
  "In Review",
  "Ready for merge",
  "Merging",
  "Done",
  "Parked",
  "Canceled",
];

export const FORBIDDEN_INTAKE_MUTATION_STATES = ["Implementing", "In Review", "Merging", "Done"];

export const WORKER_ISSUE_QUERY = `query WorkerIssue($id: String!) {
  issue(id: $id) {
    id
    identifier
    state { name type }
    labels(first: 50) { nodes { name } }
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
    attachments(first: 25) { nodes { url title } }
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
  implementing: issues(
    first: 100
    filter: {
      team: { key: { eq: $teamKey } }
      state: { name: { eq: "Implementing" } }
    }
  ) {
    nodes {
      id
      identifier
      description
    }
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

export const INTAKE_TRIAGE_QUERY = `query IntakeTriage($teamKey: String!) {
  team: teams(filter: { key: { eq: $teamKey } }, first: 1) {
    nodes { id }
  }
  backlogState: workflowStates(
    first: 1
    filter: { name: { eq: "Backlog" }, team: { key: { eq: $teamKey } } }
  ) {
    nodes { id name }
  }
  duplicateState: workflowStates(
    first: 1
    filter: { name: { eq: "Duplicate" }, team: { key: { eq: $teamKey } } }
  ) {
    nodes { id name }
  }
  labels: issueLabels(first: 50, filter: { team: { key: { eq: $teamKey } } }) {
    nodes { id name }
  }
  triage: issues(
    first: 100
    filter: {
      team: { key: { eq: $teamKey } }
      state: { name: { eq: "Triage" } }
    }
  ) {
    nodes {
      id
      identifier
      title
      description
      state { name type }
      labels(first: 50) { nodes { id name } }
      attachments(first: 25) { nodes { url title } }
      comments(first: 50) { nodes { id body } }
      relations(first: 50) {
        nodes {
          type
          issue { id identifier }
          relatedIssue { id identifier }
        }
      }
      inverseRelations(first: 50) {
        nodes {
          type
          issue { id identifier }
          relatedIssue { id identifier }
        }
      }
    }
  }
}`;

export const INTAKE_PROMOTE_MUTATION = `mutation IntakePromote($id: String!, $stateId: String!, $addedLabelIds: [String!], $removedLabelIds: [String!]) {
  issueUpdate(id: $id, input: { stateId: $stateId, addedLabelIds: $addedLabelIds, removedLabelIds: $removedLabelIds }) {
    success
    issue { id state { name } }
  }
}`;

export const INTAKE_CREATE_MUTATION = `mutation IntakeCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id identifier }
  }
}`;

export const INTAKE_DUPLICATE_MUTATION = `mutation IntakeDuplicate($issueId: String!, $relatedIssueId: String!) {
  issueRelationCreate(input: { type: duplicate, issueId: $issueId, relatedIssueId: $relatedIssueId }) {
    success
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

export const AGENT_ACTIVITY_CREATE_MUTATION = `mutation AgentActivityCreate($input: AgentActivityCreateInput!) {
  agentActivityCreate(input: $input) { success }
}`;

export const ISSUE_CLEAR_DELEGATE_MUTATION = `mutation IssueClearDelegate($id: String!) {
  issueUpdate(id: $id, input: { delegateId: null }) { success }
}`;

export const ISSUE_AGENT_SESSION_QUERY = `query IssueAgentSession($id: String!) {
  issue(id: $id) {
    agentSessions(first: 5) {
      nodes { id }
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
  const delegateId = issue.delegate?.id;
  const attachments = Array.isArray(issue.attachments?.nodes)
    ? issue.attachments.nodes
        .filter((node) => typeof node?.url === "string")
        .map((node) => ({
          url: node.url,
          title: typeof node.title === "string" ? node.title : "",
        }))
    : [];
  return {
    id: issue.id,
    identifier: issue.identifier,
    status: issue.state?.name,
    labels,
    linearType,
    blockedBy,
    delegate:
      typeof delegateName === "string"
        ? {
            name: delegateName,
            ...(typeof delegateId === "string" ? { id: delegateId } : {}),
          }
        : null,
    attachments,
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
 * @param {unknown} raw
 */
export function mapIntakeIssue(raw) {
  const base = mapPlannerIssue(raw);
  if (!base || raw === null || typeof raw !== "object") {
    return null;
  }
  const issue = raw;
  const relatedTo = [];
  const seen = new Set();
  const relationNodes = [
    ...(Array.isArray(issue.relations?.nodes) ? issue.relations.nodes : []),
    ...(Array.isArray(issue.inverseRelations?.nodes) ? issue.inverseRelations.nodes : []),
  ];
  for (const rel of relationNodes) {
    if (rel?.type !== "related") {
      continue;
    }
    const other = rel.relatedIssue ?? rel.issue;
    if (typeof other?.id !== "string" || other.id === issue.id || seen.has(other.id)) {
      continue;
    }
    seen.add(other.id);
    relatedTo.push({
      id: other.id,
      identifier: typeof other.identifier === "string" ? other.identifier : "",
    });
  }
  const comments = Array.isArray(issue.comments?.nodes)
    ? issue.comments.nodes.filter((node) => typeof node?.id === "string")
    : [];
  const labelIds = Array.isArray(issue.labels?.nodes)
    ? issue.labels.nodes
        .filter((node) => typeof node?.id === "string")
        .map((node) => ({
          id: node.id,
          name: typeof node.name === "string" ? node.name : "",
        }))
    : [];
  return {
    ...base,
    title: typeof issue.title === "string" ? issue.title : "",
    relatedTo,
    comments,
    labelIds,
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
 *   actorTokenProvider?: ReturnType<typeof createActorTokenProvider>,
 * }} [deps]
 */
export function createLinearCliClient({ env = process.env, runCommand, actorTokenProvider } = {}) {
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

  const actorTokens = actorTokenProvider ?? createActorTokenProvider({ env });

  /**
   * @param {string} query
   * @param {object} variables
   * @param {string} apiKey
   */
  async function cliWithKey(query, variables, apiKey) {
    return run("linear", ["api", query, "--variables-json", JSON.stringify(variables)], {
      env: { ...cliEnv, LINEAR_API_KEY: apiKey },
    });
  }

  /**
   * @param {string} query
   * @param {object} variables
   */
  async function cli(query, variables) {
    return cliWithKey(query, variables, cliEnv.LINEAR_API_KEY);
  }

  /**
   * @param {string} query
   * @param {object} variables
   */
  async function cliActor(query, variables) {
    const token = await actorTokens.getToken();
    try {
      return await cliWithKey(query, variables, token);
    } catch (error) {
      if (!isLinearUnauthorized(error)) {
        throw error;
      }
      const refreshed = await actorTokens.refresh();
      return cliWithKey(query, variables, refreshed);
    }
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
      const implementingIssues = Array.isArray(data?.implementing?.nodes)
        ? data.implementing.nodes
            .map((node) => {
              if (typeof node?.id !== "string" || typeof node?.identifier !== "string") {
                return null;
              }
              return {
                id: node.id,
                identifier: node.identifier,
                description: typeof node.description === "string" ? node.description : "",
              };
            })
            .filter(Boolean)
        : [];
      const issues = Array.isArray(data?.backlog?.nodes)
        ? data.backlog.nodes.map((node) => mapPlannerIssue(node)).filter(Boolean)
        : [];
      return { implementingState, implementingIssues, issues };
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
      const stdout = await cli(PLANNER_COMMENT_MUTATION, { issueId, body });
      const parsed = parseJson(stdout);
      return { id: parsed?.data?.commentCreate?.comment?.id };
    },

    /**
     * Open KIT Triage issues plus Backlog/Duplicate ids. Never looks up Implementing.
     *
     * @param {{ teamKey?: string }} [input]
     */
    async listTriage({ teamKey = "KIT" } = {}) {
      const stdout = await cli(INTAKE_TRIAGE_QUERY, { teamKey });
      const data = parseJson(stdout)?.data;
      const labels = {};
      for (const node of data?.labels?.nodes ?? []) {
        if (typeof node?.id === "string" && typeof node?.name === "string") {
          labels[node.name] = node.id;
        }
      }
      const issues = Array.isArray(data?.triage?.nodes)
        ? data.triage.nodes.map((node) => mapIntakeIssue(node)).filter(Boolean)
        : [];
      return {
        teamId: typeof data?.team?.nodes?.[0]?.id === "string" ? data.team.nodes[0].id : null,
        backlogState: data?.backlogState?.nodes?.[0] ?? null,
        duplicateState: data?.duplicateState?.nodes?.[0] ?? null,
        labels,
        issues,
      };
    },

    /**
     * Move a shaped Triage slice to Backlog. Never delegate.
     *
     * @param {{ id: string, stateId: string, addedLabelIds?: string[], removedLabelIds?: string[] }} input
     */
    async promoteIssue({ id, stateId, addedLabelIds = [], removedLabelIds = [] }) {
      await cli(INTAKE_PROMOTE_MUTATION, { id, stateId, addedLabelIds, removedLabelIds });
    },

    /**
     * @param {{ title: string, description: string, teamId: string, stateId: string, labelIds?: string[] }} input
     */
    async createTechIssue({ title, description, teamId, stateId, labelIds }) {
      const stdout = await cli(INTAKE_CREATE_MUTATION, {
        input: {
          title,
          description,
          teamId,
          stateId,
          ...(Array.isArray(labelIds) ? { labelIds } : {}),
        },
      });
      const issue = parseJson(stdout)?.data?.issueCreate?.issue;
      if (typeof issue?.id !== "string") {
        throw new Error("intake failed to create tech issue");
      }
      return {
        id: issue.id,
        identifier: typeof issue.identifier === "string" ? issue.identifier : "",
      };
    },

    /**
     * Origin leftover becomes Duplicate of the canonical tech issue. Never delegate.
     *
     * @param {{ issueId: string, canonicalId: string, stateId: string }} input
     */
    async markDuplicate({ issueId, canonicalId, stateId }) {
      await cli(INTAKE_DUPLICATE_MUTATION, { issueId, relatedIssueId: canonicalId });
      await cli(ISSUE_UPDATE_STATE_MUTATION, { id: issueId, stateId });
    },

    /**
     * @param {{ id: string, body: string }} input
     */
    async updateComment({ id, body }) {
      await cli(COMMENT_UPDATE_MUTATION, { id, body });
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

    /**
     * Display-only AgentSession activity. Never a workpad write.
     *
     * @param {{ sessionId: string, content: object, ephemeral?: boolean }} input
     */
    async createAgentActivity({ sessionId, content, ephemeral }) {
      await cliActor(AGENT_ACTIVITY_CREATE_MUTATION, {
        input: {
          agentSessionId: sessionId,
          content,
          ...(ephemeral === true ? { ephemeral: true } : {}),
        },
      });
    },

    /**
     * Live AgentSession id for an issue. Display-only; never starts Pi.
     *
     * @param {string} id
     * @returns {Promise<string | undefined>}
     */
    async getAgentSessionId(id) {
      const stdout = await cli(ISSUE_AGENT_SESSION_QUERY, { id });
      const nodes = parseJson(stdout)?.data?.issue?.agentSessions?.nodes;
      const sessionId = Array.isArray(nodes)
        ? nodes.find((node) => typeof node?.id === "string")?.id
        : undefined;
      return typeof sessionId === "string" ? sessionId : undefined;
    },

    /**
     * Nicklas's turn: drop Pi from Assignee → Agents.
     *
     * @param {{ issueId: string }} input
     */
    async clearDelegate({ issueId }) {
      await cli(ISSUE_CLEAR_DELEGATE_MUTATION, { id: issueId });
    },
  };
}
