// Reading a team's open issues from Linear's GraphQL API, and the one write
// the scheduler makes: moving an issue to another state.
import { z } from "zod";

const ENDPOINT = "https://api.linear.app/graphql";
/** 50 issues a page keeps the query under Linear's complexity limit. */
const PAGE_SIZE = 50;
const MAX_PAGES = 20;

export interface BoardIssue {
  id: string;
  identifier: string;
  title: string;
  /** Linear priority: 1 urgent … 4 low, 0 none. */
  priority: number;
  createdAt: string;
  state: string;
  labels: string[];
  milestone: string | null;
  project: string | null;
  /** Identifiers of blockers that are not completed or canceled. */
  blockedBy: string[];
  /** Globs from the description's `write-scope:` line; empty when undeclared. */
  writeScope: string[];
}

export interface Board {
  /** State name -> id, for the team. */
  states: Record<string, string>;
  issues: BoardIssue[];
}

const QUERY = `
query Board($team: String!, $first: Int!, $after: String) {
  teams(filter: { key: { eq: $team } }) { nodes { states { nodes { id name } } } }
  issues(first: $first, after: $after, filter: {
    team: { key: { eq: $team } }, state: { type: { in: ["backlog", "unstarted", "started"] } }
  }) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id identifier title priority createdAt description
      state { name }
      labels(first: 25) { nodes { name } }
      projectMilestone { name }
      project { name }
      inverseRelations(first: 25) { nodes { type issue { identifier state { type } } } }
    }
  }
}`;

const pageSchema = z.object({
  teams: z.object({
    nodes: z.array(
      z.object({ states: z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string() })) }) }),
    ),
  }),
  issues: z.object({
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
    nodes: z.array(
      z.object({
        id: z.string(),
        identifier: z.string(),
        title: z.string(),
        priority: z.number(),
        createdAt: z.string(),
        description: z.string().nullable(),
        state: z.object({ name: z.string() }),
        labels: z.object({ nodes: z.array(z.object({ name: z.string() })) }),
        projectMilestone: z.object({ name: z.string() }).nullable(),
        project: z.object({ name: z.string() }).nullable(),
        inverseRelations: z.object({
          nodes: z.array(
            z.object({
              type: z.string(),
              issue: z.object({ identifier: z.string(), state: z.object({ type: z.string() }) }),
            }),
          ),
        }),
      }),
    ),
  }),
});

/** The globs of a `write-scope: a/**, b/**` line; empty when there is none. */
export function parseWriteScope(description: string | null): string[] {
  const line = /^[ \t>*-]*write-scope:[ \t]*(.+)$/im.exec(description ?? "");
  if (line === null) return [];
  return (line[1] as string)
    .split(",")
    .map((glob) => glob.replaceAll("`", "").trim())
    .filter((glob) => glob !== "");
}

export type Fetch = typeof fetch;

async function graphql(apiKey: string, fetchImpl: Fetch, query: string, variables: unknown) {
  const response = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json().catch(() => null)) as {
    data?: unknown;
    errors?: { message?: string }[];
  } | null;
  if (!response.ok || body === null || body.errors !== undefined) {
    throw new Error(
      `Linear answered ${response.status}: ${body?.errors?.[0]?.message ?? "no usable body"}`,
    );
  }
  return body.data;
}

/** Every backlog, unstarted and started issue of the team, with blockers and write scope. */
export async function fetchBoard(apiKey: string, teamKey: string, fetchImpl: Fetch = fetch): Promise<Board> {
  const states: Record<string, string> = {};
  const issues: BoardIssue[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = pageSchema.parse(
      await graphql(apiKey, fetchImpl, QUERY, { team: teamKey, first: PAGE_SIZE, after }),
    );
    for (const state of data.teams.nodes[0]?.states.nodes ?? []) states[state.name] = state.id;
    for (const node of data.issues.nodes) {
      issues.push({
        id: node.id,
        identifier: node.identifier,
        title: node.title,
        priority: node.priority,
        createdAt: node.createdAt,
        state: node.state.name,
        labels: node.labels.nodes.map((label) => label.name),
        milestone: node.projectMilestone?.name ?? null,
        project: node.project?.name ?? null,
        // An inverse `blocks` relation: the other issue blocks this one.
        blockedBy: node.inverseRelations.nodes
          .filter(
            (relation) =>
              relation.type === "blocks" &&
              !["completed", "canceled"].includes(relation.issue.state.type),
          )
          .map((relation) => relation.issue.identifier),
        writeScope: parseWriteScope(node.description),
      });
    }
    if (!data.issues.pageInfo.hasNextPage) return { states, issues };
    after = data.issues.pageInfo.endCursor;
  }
  throw new Error(`team ${teamKey} has more than ${PAGE_SIZE * MAX_PAGES} open issues`);
}

export async function moveIssue(
  apiKey: string,
  issueId: string,
  stateId: string,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  await graphql(
    apiKey,
    fetchImpl,
    `mutation Move($id: String!, $stateId: String!) {
       issueUpdate(id: $id, input: { stateId: $stateId }) { success }
     }`,
    { id: issueId, stateId },
  );
}

/**
 * Promotes an issue: moves it to the state, adds the label, and leaves a
 * comment that says why. The label is found by name, the team's own first.
 */
export async function promoteIssue(
  apiKey: string,
  input: { issueId: string; stateId: string; teamKey: string; label: string; comment: string },
  fetchImpl: Fetch = fetch,
): Promise<void> {
  const found = z
    .object({
      issueLabels: z.object({
        nodes: z.array(z.object({ id: z.string(), team: z.object({ key: z.string() }).nullable() })),
      }),
    })
    .parse(
      await graphql(
        apiKey,
        fetchImpl,
        `query Label($name: String!) { issueLabels(filter: { name: { eq: $name } }) { nodes { id team { key } } } }`,
        { name: input.label },
      ),
    ).issueLabels.nodes;
  const label = found.find((node) => node.team?.key === input.teamKey) ?? found.find((node) => node.team === null);
  if (label === undefined) throw new Error(`Linear has no label "${input.label}" for team ${input.teamKey}`);
  await graphql(
    apiKey,
    fetchImpl,
    `mutation Promote($id: String!, $stateId: String!, $labelId: String!, $body: String!) {
       issueUpdate(id: $id, input: { stateId: $stateId }) { success }
       issueAddLabel(id: $id, labelId: $labelId) { success }
       commentCreate(input: { issueId: $id, body: $body }) { success }
     }`,
    { id: input.issueId, stateId: input.stateId, labelId: label.id, body: input.comment },
  );
}

/** An issue as the trigger poller sees it. */
export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  teamKey: string;
  project: string | null;
  state: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

const UPDATED_QUERY = `
query Updated($teams: [String!]!, $since: DateTimeOrDuration!, $first: Int!, $after: String) {
  issues(first: $first, after: $after, orderBy: updatedAt, filter: {
    team: { key: { in: $teams } }, updatedAt: { gt: $since }
  }) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id identifier title url createdAt updatedAt
      team { key }
      state { name }
      labels(first: 25) { nodes { name } }
      project { name }
    }
  }
}`;

const updatedSchema = z.object({
  issues: z.object({
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
    nodes: z.array(
      z.object({
        id: z.string(),
        identifier: z.string(),
        title: z.string(),
        url: z.string(),
        createdAt: z.string(),
        updatedAt: z.string(),
        team: z.object({ key: z.string() }),
        state: z.object({ name: z.string() }),
        labels: z.object({ nodes: z.array(z.object({ name: z.string() })) }),
        project: z.object({ name: z.string() }).nullable(),
      }),
    ),
  }),
});

/** Issues of the teams updated after `since` (an ISO time), in any state. */
export async function fetchUpdatedIssues(
  apiKey: string,
  teamKeys: string[],
  since: string,
  fetchImpl: Fetch = fetch,
): Promise<LinearIssue[]> {
  const issues: LinearIssue[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = updatedSchema.parse(
      await graphql(apiKey, fetchImpl, UPDATED_QUERY, { teams: teamKeys, since, first: 100, after }),
    );
    for (const node of data.issues.nodes) {
      issues.push({
        id: node.id,
        identifier: node.identifier,
        title: node.title,
        url: node.url,
        teamKey: node.team.key,
        project: node.project?.name ?? null,
        state: node.state.name,
        labels: node.labels.nodes.map((label) => label.name),
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      });
    }
    if (!data.issues.pageInfo.hasNextPage) break;
    after = data.issues.pageInfo.endCursor;
  }
  return issues;
}

export interface LinearTeamOptions {
  key: string;
  name: string;
  states: string[];
  projects: string[];
}

const optionsSchema = z.object({
  teams: z.object({
    nodes: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        states: z.object({ nodes: z.array(z.object({ name: z.string() })) }),
        projects: z.object({ nodes: z.array(z.object({ name: z.string() })) }),
      }),
    ),
  }),
});

/** The workspace's teams with their states and projects, for the trigger form. */
export async function fetchLinearOptions(apiKey: string, fetchImpl: Fetch = fetch): Promise<LinearTeamOptions[]> {
  const data = optionsSchema.parse(
    await graphql(
      apiKey,
      fetchImpl,
      `{ teams(first: 50) { nodes { key name states { nodes { name } } projects(first: 100) { nodes { name } } } } }`,
      {},
    ),
  );
  return data.teams.nodes.map((team) => ({
    key: team.key,
    name: team.name,
    states: team.states.nodes.map((state) => state.name),
    projects: team.projects.nodes.map((project) => project.name).sort((a, b) => a.localeCompare(b)),
  }));
}
