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
  throw new Error(`team ${teamKey} has more than ${PAGE_SIZE * MAX_PAGES} issues in ${stateName}`);
}
