// The Linear reads the thread area makes: whether, and since when, some issues of a team are Done (the archiver), and their titles and states (the thread list).
import { z } from "zod";

const ENDPOINT = "https://api.linear.app/graphql";
/** Issue numbers per request; a team has far more open threads than finished issues to ask about. */
const BATCH = 50;

/** An issue that is in a completed state, and when it got there. */
export interface DoneIssue {
  identifier: string;
  /** Epoch ms. */
  completedAt: number;
}

const QUERY = `
query Done($team: String!, $numbers: [Float!], $first: Int!) {
  issues(first: $first, filter: { team: { key: { eq: $team } }, number: { in: $numbers } }) {
    nodes { identifier completedAt state { type } }
  }
}`;

const nodesOf = <Node extends z.ZodType>(node: Node) =>
  z.object({
    data: z.object({ issues: z.object({ nodes: z.array(node) }) }).optional(),
    errors: z.array(z.object({ message: z.string().optional() })).optional(),
  });

/** One batch of the issues of a team by number: the nodes Linear answered with, or why it did not. */
async function fetchBatch<Node extends z.ZodType>(
  apiKey: string,
  query: string,
  teamKey: string,
  batch: number[],
  node: Node,
  fetchImpl: typeof fetch,
): Promise<z.output<Node>[]> {
  const response = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: apiKey },
    body: JSON.stringify({
      query,
      variables: { team: teamKey, numbers: batch, first: batch.length },
    }),
  });
  const parsed = nodesOf(node).safeParse(await response.json().catch(() => null));
  const body = parsed.success ? parsed.data : null;
  if (!response.ok || body?.data === undefined || body.errors !== undefined) {
    throw new Error(
      `Linear answered ${response.status}: ${body?.errors?.[0]?.message ?? "no usable body"}`,
    );
  }
  return body.data.issues.nodes;
}

const doneNode = z.object({
  identifier: z.string(),
  completedAt: z.string().nullable(),
  state: z.object({ type: z.string() }),
});

/**
 * The issues of `numbers` that are completed now, by their state type. A completion date can
 * linger on an issue that came back from Done, and a canceled one is not completed: neither is returned.
 */
export async function fetchDone(
  apiKey: string,
  teamKey: string,
  numbers: number[],
  fetchImpl: typeof fetch = fetch,
): Promise<DoneIssue[]> {
  const found: DoneIssue[] = [];
  for (let from = 0; from < numbers.length; from += BATCH) {
    const batch = numbers.slice(from, from + BATCH);
    for (const node of await fetchBatch(apiKey, QUERY, teamKey, batch, doneNode, fetchImpl)) {
      if (node.state.type !== "completed" || node.completedAt === null) continue;
      found.push({ identifier: node.identifier, completedAt: Date.parse(node.completedAt) });
    }
  }
  return found;
}

/** An issue as the thread list files it: its title, the name and type of its state. */
export interface IssueState {
  identifier: string;
  title: string;
  /** The state's name in Linear, such as `Approval`. */
  state: string;
  /** The state's type, such as `started` or `completed`. */
  type: string;
}

const STATES_QUERY = `
query States($team: String!, $numbers: [Float!], $first: Int!) {
  issues(first: $first, filter: { team: { key: { eq: $team } }, number: { in: $numbers } }) {
    nodes { identifier title state { name type } }
  }
}`;

const stateNode = z.object({
  identifier: z.string(),
  title: z.string(),
  state: z.object({ name: z.string(), type: z.string() }),
});

/** The titles and states of the issues of `numbers`; an issue Linear does not know is left out. */
export async function fetchStates(
  apiKey: string,
  teamKey: string,
  numbers: number[],
  fetchImpl: typeof fetch = fetch,
): Promise<IssueState[]> {
  const found: IssueState[] = [];
  for (let from = 0; from < numbers.length; from += BATCH) {
    const batch = numbers.slice(from, from + BATCH);
    for (const node of await fetchBatch(
      apiKey,
      STATES_QUERY,
      teamKey,
      batch,
      stateNode,
      fetchImpl,
    )) {
      found.push({
        identifier: node.identifier,
        title: node.title,
        state: node.state.name,
        type: node.state.type,
      });
    }
  }
  return found;
}
