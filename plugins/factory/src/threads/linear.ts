// The one Linear read the archiver makes: whether, and since when, some issues of a team are Done.
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

const answer = z.object({
  data: z
    .object({
      issues: z.object({
        nodes: z.array(
          z.object({
            identifier: z.string(),
            completedAt: z.string().nullable(),
            state: z.object({ type: z.string() }),
          }),
        ),
      }),
    })
    .optional(),
  errors: z.array(z.object({ message: z.string().optional() })).optional(),
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
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: apiKey },
      body: JSON.stringify({
        query: QUERY,
        variables: { team: teamKey, numbers: batch, first: batch.length },
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
      if (node.state.type !== "completed" || node.completedAt === null) continue;
      found.push({ identifier: node.identifier, completedAt: Date.parse(node.completedAt) });
    }
  }
  return found;
}
