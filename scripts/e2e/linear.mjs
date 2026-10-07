/**
 * Linear access for device-flow evidence (KIT-267): the issue body the review
 * judges against, and the `### Evidence` section of the issue's workpad.
 */
const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";
const WORKPAD_HEADING = "## Agent Workpad";

/**
 * The issue a PR belongs to, from its title or branch (`KIT-267: …`).
 * @param {string} text
 * @param {string} teamKey
 */
export function issueIdentifier(text, teamKey) {
  const match = new RegExp(`\\b${teamKey}-(\\d+)\\b`, "i").exec(text);
  return match ? `${teamKey}-${match[1]}` : null;
}

async function linear(apiKey, query, variables) {
  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) {
    throw new Error(
      `Linear answered HTTP ${response.status}: ${body.errors?.[0]?.message ?? "error"}`,
    );
  }
  return body.data;
}

/**
 * @param {string} apiKey
 * @param {string} identifier
 * @returns {Promise<{ description: string, workpad: { id: string, body: string } | null } | null>}
 */
export async function fetchIssue(apiKey, identifier) {
  const data = await linear(
    apiKey,
    "query($id: String!) { issue(id: $id) { description comments(first: 100) { nodes { id body } } } }",
    { id: identifier },
  );
  if (!data.issue) {
    return null;
  }
  const workpad = data.issue.comments.nodes.find((comment) =>
    comment.body.startsWith(WORKPAD_HEADING),
  );
  return { description: data.issue.description ?? "", workpad: workpad ?? null };
}

/**
 * @param {string} apiKey
 * @param {string} commentId
 * @param {string} body
 */
export async function updateComment(apiKey, commentId, body) {
  await linear(
    apiKey,
    "mutation($id: String!, $body: String!) { commentUpdate(id: $id, input: { body: $body }) { success } }",
    { id: commentId, body },
  );
}
