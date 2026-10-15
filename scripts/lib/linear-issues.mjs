/**
 * `list` and `create` for scripts/linear.mjs. The GraphQL call is injected (`gql(query, variables)`)
 * and failures are thrown as `LinearUsageError`, so tests run against a fake transport.
 */

import { blockerResolvesDependents, POST_MERGE_STATUS } from "./land-policy.mjs";
import { issueIdentifier, optionValue } from "./linear-args.mjs";
import { parseWriteScopeGlobs } from "./pr-write-scope.mjs";

export class LinearUsageError extends Error {}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const PAGE_SIZE = 50;
const TEAM_KEY = "KIT";
/**
 * The line Milestone scenarios ends every failure issue with (KIT-354). `list` reports it as
 * `scenarioFailure`; `check` and `report` read the issue as one they filed only when a title that
 * starts `Scenario not met:` also carries this line. It sits in the description, which a title edit
 * does not touch; it is a marker, not a signature (anyone who can write an issue can copy it).
 */
export const SCENARIO_FAILURE_FOOTER = "Filed by Milestone scenarios (failure issue)";
const FOOTER_LINE = new RegExp(`^${SCENARIO_FAILURE_FOOTER.replace(/[()]/g, "\\$&")}\\s*$`, "m");

const REFUSED_LABELS = new Map([
  ["signal-up", "use `signal-up` (it files into Triage, related to its origin, with its own cap)"],
  ["proposal", "proposals are filed from /qualified-proposals into Triage, at most one per run"],
]);

/** Values of every occurrence of a repeatable flag. */
export function optionValues(args, flag) {
  const values = [];
  args.forEach((arg, index) => {
    const value = args[index + 1];
    if (arg === flag && value && !value.startsWith("--")) {
      values.push(value);
    }
  });
  return values;
}

function byName(nodes, name) {
  return nodes.find((node) => node.name.toLowerCase() === name.toLowerCase());
}

function resolveName(nodes, name, kind) {
  const found = byName(nodes, name);
  if (!found) {
    const valid = nodes.map((node) => node.name).join(", ");
    throw new LinearUsageError(`no ${kind} "${name}"; valid: ${valid}`);
  }
  return found;
}

async function loadTeam(gql) {
  const { teams } = await gql(
    "query($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id } } }",
    { key: TEAM_KEY },
  );
  const id = teams.nodes[0]?.id;
  if (!id) {
    throw new LinearUsageError(`team ${TEAM_KEY} not found`);
  }
  const { workflowStates } = await gql(
    "query($id: ID!) { workflowStates(first: 100, filter: { team: { id: { eq: $id } } }) { nodes { id name type } } }",
    { id },
  );
  const labels = [];
  let after = null;
  for (;;) {
    const { issueLabels } = await gql(
      `query($key: String!, $after: String) { issueLabels(first: 100, after: $after, filter: { or: [{ team: { key: { eq: $key } } }, { team: { null: true } }] }) {
        nodes { id name parent { id name } }
        pageInfo { hasNextPage endCursor }
      } }`,
      { key: TEAM_KEY, after },
    );
    labels.push(...issueLabels.nodes);
    if (!issueLabels.pageInfo.hasNextPage) {
      break;
    }
    after = issueLabels.pageInfo.endCursor;
  }
  return { id, states: { nodes: workflowStates.nodes }, labels: { nodes: labels } };
}

function clampLimit(raw) {
  if (raw === null) {
    return DEFAULT_LIMIT;
  }
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new LinearUsageError(`--limit must be a positive integer, got "${raw}"`);
  }
  return Math.min(limit, MAX_LIMIT);
}

const LIST_QUERY = `query($filter: IssueFilter, $first: Int!, $after: String) {
  issues(filter: $filter, first: $first, after: $after) {
    nodes {
      identifier title url description
      state { name }
      project { name }
      projectMilestone { name }
      labels(first: 20) { nodes { name } }
      inverseRelations(first: 20) { nodes { type issue { identifier state { name } } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

/**
 * Issues of the KIT team, as compact records. `argv` is the argument list after `list`.
 * @returns {Promise<object[]>}
 */
export async function listIssues(gql, argv) {
  const states = (optionValue(argv, "--state") ?? "").split(",").filter(Boolean);
  const label = optionValue(argv, "--label");
  const noLabel = optionValue(argv, "--no-label");
  const project = optionValue(argv, "--project");
  const milestone = optionValue(argv, "--milestone");
  const unblocked = argv.includes("--unblocked");
  const limit = clampLimit(optionValue(argv, "--limit"));

  const team = await loadTeam(gql);
  const stateNames = states.map((name) => resolveName(team.states.nodes, name, "state").name);
  const labelName = label ? resolveName(team.labels.nodes, label, "label").name : null;
  const noLabelName = noLabel ? resolveName(team.labels.nodes, noLabel, "label").name : null;

  const and = [{ team: { key: { eq: TEAM_KEY } } }];
  if (stateNames.length > 0) {
    and.push({ state: { name: { in: stateNames } } });
  }
  if (labelName) {
    and.push({ labels: { some: { name: { eq: labelName } } } });
  }
  if (noLabelName) {
    and.push({ labels: { every: { name: { neq: noLabelName } } } });
  }
  if (project) {
    and.push({ project: { name: { eqIgnoreCase: project } } });
  }
  if (milestone) {
    and.push({ projectMilestone: { name: { eqIgnoreCase: milestone } } });
  }

  const items = [];
  let after = null;
  while (items.length < limit) {
    const { issues } = await gql(LIST_QUERY, { filter: { and }, first: PAGE_SIZE, after });
    for (const node of issues.nodes) {
      const item = compactIssue(node, team.states.nodes);
      if (unblocked && item.blockedBy.length > 0) {
        continue;
      }
      items.push(item);
      if (items.length === limit) {
        break;
      }
    }
    if (!issues.pageInfo.hasNextPage) {
      break;
    }
    after = issues.pageInfo.endCursor;
  }
  return items;
}

function blockerIsResolved(stateName, states) {
  return stateName === POST_MERGE_STATUS || blockerResolvesDependents(stateName, states);
}

function compactIssue(node, states) {
  const blockedBy = node.inverseRelations.nodes
    .filter(
      (relation) =>
        relation.type === "blocks" && !blockerIsResolved(relation.issue.state.name, states),
    )
    .map((relation) => relation.issue.identifier);
  return {
    identifier: node.identifier,
    title: node.title,
    state: node.state.name,
    labels: node.labels.nodes.map((label) => label.name),
    blockedBy,
    writeScope: parseWriteScopeGlobs(node.description ?? ""),
    scenarioFailure: FOOTER_LINE.test(node.description ?? ""),
    project: node.project?.name ?? null,
    milestone: node.projectMilestone?.name ?? null,
    url: node.url,
  };
}

/**
 * Validated arguments of `create`, with the body already read. Throws on every guardrail.
 * @param {string[]} argv arguments after `create`
 * @param {(path: string) => string | null} readBody the body file's text, or null when missing
 */
export function parseCreateArgs(argv, readBody) {
  const usage =
    'create "<title>" --body-file <path> [--state <name>] [--label <name>]... [--project <name> [--milestone <name>]] [--parent KIT-n] [--blocked-by KIT-n]...';
  const title = argv[0] && !argv[0].startsWith("--") ? argv[0] : null;
  if (!title) {
    throw new LinearUsageError(usage);
  }
  const bodyPath = optionValue(argv, "--body-file");
  if (!bodyPath) {
    throw new LinearUsageError(`--body-file <path> is required: ${usage}`);
  }
  const body = readBody(bodyPath);
  if (body === null) {
    throw new LinearUsageError(`body file ${bodyPath} does not exist`);
  }
  if (body.trim() === "") {
    throw new LinearUsageError(`body file ${bodyPath} is empty`);
  }
  const parentRaw = optionValue(argv, "--parent");
  const parent = parentRaw ? issueIdentifier(parentRaw) : null;
  if (parentRaw && !parent) {
    throw new LinearUsageError(
      `--parent needs an issue identifier like KIT-12, got "${parentRaw}"`,
    );
  }
  const blockedBy = optionValues(argv, "--blocked-by").map((raw) => {
    const id = issueIdentifier(raw);
    if (!id) {
      throw new LinearUsageError(
        `--blocked-by needs an issue identifier like KIT-12, got "${raw}"`,
      );
    }
    return id;
  });
  const project = optionValue(argv, "--project");
  const milestone = optionValue(argv, "--milestone");
  if (milestone && !project) {
    throw new LinearUsageError(
      `--milestone needs --project (a milestone belongs to a project): ${usage}`,
    );
  }
  return {
    title,
    body,
    state: optionValue(argv, "--state") ?? "Backlog",
    labels: optionValues(argv, "--label"),
    project,
    milestone,
    parent,
    blockedBy,
  };
}

/** The factory rules a created issue must meet; throws naming the broken one. */
export function assertCreateGuardrails({ labels, state, body }, labelNodes) {
  for (const name of labels) {
    const reason = REFUSED_LABELS.get(name.toLowerCase());
    if (reason) {
      throw new LinearUsageError(`label "${name}" is refused by create: ${reason}`);
    }
  }
  const resolved = labels.map((name) => resolveName(labelNodes, name, "label"));
  for (const [index, label] of resolved.entries()) {
    const clash = resolved.find(
      (other, otherIndex) =>
        otherIndex > index && label.parent?.id && other.parent?.id === label.parent.id,
    );
    if (clash) {
      throw new LinearUsageError(
        `labels "${label.name}" and "${clash.name}" are in the same exclusive group "${label.parent.name}"; an issue carries one`,
      );
    }
  }
  if (resolved.some((label) => label.name === "ready-for-agent")) {
    if (state !== "To-do" && state !== "Backlog") {
      throw new LinearUsageError(`ready-for-agent needs state To-do or Backlog, got "${state}"`);
    }
    const scope = parseWriteScopeGlobs(body);
    if (!scope || scope.length === 0) {
      throw new LinearUsageError(
        "ready-for-agent needs a non-empty `write-scope:` line in the body",
      );
    }
    if (!/^## Acceptance criteria\s*$[\s\S]*?^\s*- \[ \] \S/m.test(body)) {
      throw new LinearUsageError(
        "ready-for-agent needs an `## Acceptance criteria` section with at least one `- [ ]` item",
      );
    }
  }
  return resolved;
}

/** The project of that name (case-insensitive) with its milestones. */
async function loadProject(gql, name) {
  const { projects } = await gql(
    "query($name: String!) { projects(filter: { name: { eqIgnoreCase: $name } }) { nodes { id name projectMilestones(first: 100) { nodes { id name } } } } }",
    { name },
  );
  const project = projects.nodes[0];
  if (!project?.id) {
    throw new LinearUsageError(`no project "${name}"`);
  }
  return project;
}

/**
 * Create the issue on the KIT team. Returns the identifier and url.
 * `relate(blockedId, blockerId)` creates the blocking relation, as `block` does.
 */
export async function createIssue(gql, parsed, { loadIssueId, block }) {
  const team = await loadTeam(gql);
  const state = resolveName(team.states.nodes, parsed.state, "state");
  const labels = assertCreateGuardrails({ ...parsed, state: state.name }, team.labels.nodes);

  let projectId;
  let milestoneId;
  if (parsed.project) {
    const project = await loadProject(gql, parsed.project);
    projectId = project.id;
    if (parsed.milestone) {
      const milestones = project.projectMilestones?.nodes ?? [];
      const found = byName(milestones, parsed.milestone);
      if (!found) {
        throw new LinearUsageError(
          `no milestone "${parsed.milestone}" in project ${parsed.project}; valid: ${milestones.map((m) => m.name).join(", ")}`,
        );
      }
      milestoneId = found.id;
    }
  }
  const parentId = parsed.parent ? await loadIssueId(parsed.parent) : undefined;
  const blockers = parsed.blockedBy;
  for (const blocker of blockers) {
    await loadIssueId(blocker);
  }

  const { issueCreate } = await gql(
    "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { identifier url } } }",
    {
      input: {
        teamId: team.id,
        stateId: state.id,
        title: parsed.title,
        description: parsed.body,
        labelIds: labels.map((label) => label.id),
        ...(projectId ? { projectId } : {}),
        ...(milestoneId ? { projectMilestoneId: milestoneId } : {}),
        ...(parentId ? { parentId } : {}),
      },
    },
  );
  const created = issueCreate.issue;
  for (const blocker of blockers) {
    await block(created.identifier, blocker);
  }
  return created;
}

/**
 * Arguments of `project-comment "<project>" --body-file <path>`, with the body already read.
 * @param {string[]} argv arguments after `project-comment`
 * @param {(path: string) => string | null} readBody
 */
export function parseProjectCommentArgs(argv, readBody) {
  const usage = 'project-comment "<project>" --body-file <path>';
  const project = argv[0] && !argv[0].startsWith("--") ? argv[0] : null;
  if (!project) {
    throw new LinearUsageError(usage);
  }
  const bodyPath = optionValue(argv, "--body-file");
  if (!bodyPath) {
    throw new LinearUsageError(`--body-file <path> is required: ${usage}`);
  }
  const body = readBody(bodyPath);
  if (body === null) {
    throw new LinearUsageError(`body file ${bodyPath} does not exist`);
  }
  if (body.trim() === "") {
    throw new LinearUsageError(`body file ${bodyPath} is empty`);
  }
  return { project, body };
}

/** One comment on a project (Linear's `CommentCreateInput.projectId`). Returns its id and url. */
export async function createProjectComment(gql, { project, body }) {
  const { id } = await loadProject(gql, project);
  const { commentCreate } = await gql(
    "mutation($input: CommentCreateInput!) { commentCreate(input: $input) { comment { id url } } }",
    { input: { projectId: id, body } },
  );
  return commentCreate.comment;
}
