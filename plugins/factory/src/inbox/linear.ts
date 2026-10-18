// The one Linear read the Inbox makes: the issues of a team that are in a state now.
import { z } from "zod";

const ENDPOINT = "https://api.linear.app/graphql";
/** Comments and history per issue raise the query's complexity, so a page is small. */
const PAGE_SIZE = 15;
const MAX_PAGES = 20;

/** An issue waiting in a state, with what the Inbox needs to show it. */
export interface WaitingIssue {
  identifier: string;
  title: string;
  url: string;
  createdAt: string;
  labels: string[];
  attachments: { url: string; title: string }[];
  /** Comment bodies, for the workpad. */
  comments: string[];
  /** The moves of the issue between states. */
  history: { createdAt: string; toState: string | null }[];
}

const QUERY = `
query Waiting($team: String!, $state: String!, $first: Int!, $after: String) {
  issues(first: $first, after: $after, filter: {
    team: { key: { eq: $team } }, state: { name: { eq: $state } }
  }) {
    pageInfo { hasNextPage endCursor }
    nodes {
      identifier title url createdAt
      labels(first: 25) { nodes { name } }
      attachments(first: 25) { nodes { url title } }
      comments(first: 100) { nodes { body } }
      history(first: 25) { nodes { createdAt toState { name } } }
    }
  }
}`;

const answer = z.object({
  data: z
    .object({
      issues: z.object({
        pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
        nodes: z.array(
          z.object({
            identifier: z.string(),
            title: z.string(),
            url: z.string(),
            createdAt: z.string(),
            labels: z.object({ nodes: z.array(z.object({ name: z.string() })) }),
            attachments: z.object({
              nodes: z.array(z.object({ url: z.string(), title: z.string().nullable() })),
            }),
            comments: z.object({ nodes: z.array(z.object({ body: z.string() })) }),
            history: z.object({
              nodes: z.array(
                z.object({
                  createdAt: z.string(),
                  toState: z.object({ name: z.string() }).nullable(),
                }),
              ),
            }),
          }),
        ),
      }),
    })
    .optional(),
  errors: z.array(z.object({ message: z.string().optional() })).optional(),
});

/** Every issue of the team that is in the state now, read fresh on each call. */
export async function fetchWaiting(
  apiKey: string,
  teamKey: string,
  stateName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WaitingIssue[]> {
  const issues: WaitingIssue[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: apiKey },
      body: JSON.stringify({
        query: QUERY,
        variables: { team: teamKey, state: stateName, first: PAGE_SIZE, after },
      }),
    });
    const parsed = answer.safeParse(await response.json().catch(() => null));
    const body = parsed.success ? parsed.data : null;
    if (!response.ok || body?.data === undefined || body.errors !== undefined) {
      throw new Error(
        `Linear answered ${response.status}: ${body?.errors?.[0]?.message ?? "no usable body"}`,
      );
    }
    for (const node of body.data.issues.nodes) {
      issues.push({
        identifier: node.identifier,
        title: node.title,
        url: node.url,
        createdAt: node.createdAt,
        labels: node.labels.nodes.map((label) => label.name),
        attachments: node.attachments.nodes.map((attachment) => ({
          url: attachment.url,
          title: attachment.title ?? "",
        })),
        comments: node.comments.nodes.map((comment) => comment.body),
        history: node.history.nodes.map((entry) => ({
          createdAt: entry.createdAt,
          toState: entry.toState?.name ?? null,
        })),
      });
    }
    const { hasNextPage, endCursor } = body.data.issues.pageInfo;
    if (!hasNextPage) return issues;
    after = endCursor;
  }
  throw new Error(
    `team ${teamKey} has more than ${PAGE_SIZE * MAX_PAGES} issues in ${stateName}, so no waiting issue is shown`,
  );
}

const SETTLE_QUERY = `
query Settle($id: String!, $label: String!) {
  issue(id: $id) {
    id
    state { name }
    labels(first: 50) { nodes { id name } }
    team { key states(first: 50) { nodes { id name } } }
  }
  issueLabels(filter: { name: { eq: $label } }) { nodes { id team { key } } }
}`;

const settleData = z.object({
  issue: z
    .object({
      id: z.string(),
      state: z.object({ name: z.string() }),
      labels: z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string() })) }),
      team: z.object({
        key: z.string(),
        states: z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string() })) }),
      }),
    })
    .nullable(),
  issueLabels: z.object({
    nodes: z.array(z.object({ id: z.string(), team: z.object({ key: z.string() }).nullable() })),
  }),
});

export async function call(
  apiKey: string,
  fetchImpl: typeof fetch,
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  const parsed = z
    .object({
      data: z.unknown().optional(),
      errors: z.array(z.object({ message: z.string().optional() })).optional(),
    })
    .safeParse(await response.json().catch(() => null));
  const body = parsed.success ? parsed.data : null;
  if (!response.ok || body?.data === undefined || body.data === null || body.errors !== undefined) {
    throw new Error(
      `Linear answered ${response.status}: ${body?.errors?.[0]?.message ?? "no usable body"}`,
    );
  }
  return body.data;
}

/** What a settled issue gets: the key owner's comment, then the Loop's label and state in place of the question. */
export interface Settlement {
  identifier: string;
  teamKey: string;
  comment: string;
  /** The state the issue must be in now for the write to go ahead. */
  waitingState: string;
  /** The question labels to take off. */
  dropLabels: string[];
  /** A card of this kind must carry a question label (an answer) or none (a rejection). */
  expectQuestion: boolean;
  /** The state and label the Loop that picks the issue up again waits on. */
  toState: string;
  toLabel: string;
}

/**
 * Writes the comment, then swaps the labels and moves the issue. The issue is read first: one that
 * is no longer waiting, or whose kind changed, is refused so a stale card writes nothing. When the
 * move fails after the comment went in, the comment is deleted again, so the issue stays as it was.
 */
export async function settleIssue(
  apiKey: string,
  settlement: Settlement,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const read = settleData.safeParse(
    await call(apiKey, fetchImpl, SETTLE_QUERY, {
      id: settlement.identifier,
      label: settlement.toLabel,
    }),
  );
  const data = read.success ? read.data : undefined;
  if (data === undefined || data.issue === null) {
    throw new Error(`Linear has no issue ${settlement.identifier}`);
  }
  const issue = data.issue;
  if (issue.state.name !== settlement.waitingState) {
    throw new Error(
      `${settlement.identifier} is in ${issue.state.name} now, not ${settlement.waitingState}: refresh the Inbox`,
    );
  }
  const carries = issue.labels.nodes.some((label) => settlement.dropLabels.includes(label.name));
  if (carries !== settlement.expectQuestion) {
    throw new Error(
      `${settlement.identifier} is ${carries ? "a question" : "a review"} now: refresh the Inbox`,
    );
  }
  const state = issue.team.states.nodes.find((node) => node.name === settlement.toState);
  if (state === undefined) {
    throw new Error(`team ${issue.team.key} has no state "${settlement.toState}"`);
  }
  const ready =
    data.issueLabels.nodes.find((node) => node.team?.key === settlement.teamKey) ??
    data.issueLabels.nodes.find((node) => node.team === null);
  if (ready === undefined) {
    throw new Error(`Linear has no label "${settlement.toLabel}" for team ${settlement.teamKey}`);
  }
  const labelIds = [
    ...new Set([
      ...issue.labels.nodes
        .filter((label) => !settlement.dropLabels.includes(label.name))
        .map((label) => label.id),
      ready.id,
    ]),
  ];
  const created = z
    .object({
      commentCreate: z.object({
        success: z.boolean(),
        comment: z.object({ id: z.string() }).nullable(),
      }),
    })
    .safeParse(
      await call(
        apiKey,
        fetchImpl,
        `mutation Comment($id: String!, $body: String!) {
           commentCreate(input: { issueId: $id, body: $body }) { success comment { id } }
         }`,
        { id: issue.id, body: settlement.comment },
      ),
    );
  const comment =
    created.success && created.data.commentCreate.success
      ? created.data.commentCreate.comment
      : null;
  if (comment === null) throw new Error("Linear did not save the comment");
  try {
    const moved = z.object({ issueUpdate: z.object({ success: z.boolean() }) }).safeParse(
      await call(
        apiKey,
        fetchImpl,
        `mutation Hand($id: String!, $stateId: String!, $labelIds: [String!]!) {
             issueUpdate(id: $id, input: { stateId: $stateId, labelIds: $labelIds }) { success }
           }`,
        { id: issue.id, stateId: state.id, labelIds },
      ),
    );
    if (!moved.success || !moved.data.issueUpdate.success) {
      throw new Error("Linear did not save the move");
    }
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    const undone = await call(
      apiKey,
      fetchImpl,
      `mutation Undo($id: String!) { commentDelete(id: $id) { success } }`,
      { id: comment.id },
    ).then(
      () => true,
      () => false,
    );
    throw new Error(
      undone
        ? why
        : `${why}; the comment was posted and could not be taken back, so it is on ${settlement.identifier} now`,
    );
  }
}
