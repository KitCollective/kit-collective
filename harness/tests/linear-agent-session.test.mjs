/**
 * Outbound Linear Agent Session — human-language activities, fail open.
 * Inbound AgentSession webhooks stay skipped (KIT-113).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_ACTIVITY_CREATE_MUTATION,
  AGENT_SESSION_CREATE_MUTATION,
  createAgentSessionBridge,
} from "../linear-agent-session.mjs";

function fakeGraphql() {
  const calls = [];
  return {
    calls,
    async postGraphql(input) {
      calls.push(input);
      if (input.query === AGENT_SESSION_CREATE_MUTATION) {
        return {
          agentSessionCreateOnIssue: {
            success: true,
            agentSession: { id: "session-kit-125" },
          },
        };
      }
      return { agentActivityCreate: { success: true } };
    },
  };
}

async function pump(bridge, lines) {
  for (const line of lines) {
    await bridge.consumeLine(line);
  }
}

test("missing LINEAR_PI_ACCESS_TOKEN never posts GraphQL", async () => {
  const graphql = fakeGraphql();
  const bridge = createAgentSessionBridge({
    env: { LINEAR_CLI_API_KEY: "lin_cli_must_not_be_used" },
    issueId: "issue-1",
    identifier: "KIT-125",
    role: "implement",
    postGraphql: graphql.postGraphql,
    coalesceMs: 60_000,
  });
  await bridge.start();
  await pump(bridge, [
    '{"type":"tool_execution_start","toolName":"bash","args":{"command":"grep -rn foo src/"}}',
  ]);
  await bridge.finish({ ok: true });
  assert.equal(graphql.calls.length, 0);
});

test("start creates a session and a thought within the first posts", async () => {
  const graphql = fakeGraphql();
  const bridge = createAgentSessionBridge({
    env: { LINEAR_PI_ACCESS_TOKEN: "actor-token" },
    issueId: "issue-1",
    identifier: "KIT-125",
    role: "implement",
    postGraphql: graphql.postGraphql,
    coalesceMs: 60_000,
  });
  await bridge.start();
  assert.equal(graphql.calls[0].query, AGENT_SESSION_CREATE_MUTATION);
  assert.deepEqual(graphql.calls[0].variables.input, { issueId: "issue-1" });
  assert.equal(graphql.calls[1].query, AGENT_ACTIVITY_CREATE_MUTATION);
  assert.deepEqual(graphql.calls[1].variables.input.content, {
    type: "thought",
    body: "Starting implement on KIT-125.",
  });
  const serialized = JSON.stringify(graphql.calls);
  assert.doesNotMatch(serialized, /actor-token/);
  assert.doesNotMatch(serialized, /lin_api_/);
});

test("bash grep streams Searching the codebase, not the raw command", async () => {
  const graphql = fakeGraphql();
  const bridge = createAgentSessionBridge({
    env: { LINEAR_PI_ACCESS_TOKEN: "actor-token" },
    issueId: "issue-1",
    identifier: "KIT-125",
    role: "implement",
    postGraphql: graphql.postGraphql,
    coalesceMs: 60_000,
  });
  await bridge.start();
  await pump(bridge, [
    `{"type":"tool_execution_start","toolName":"bash","args":{"command":"grep -rn 'foo' src/"}}`,
    `{"type":"tool_execution_end","toolName":"bash","isError":false,"result":{"stdout":"${"PASS\\n".repeat(40)}"}}`,
    `{"type":"tool_execution_start","toolName":"bash","args":{"command":"grep -rn 'bar' src/"}}`,
    `{"type":"tool_execution_end","toolName":"bash","isError":false,"result":{}}`,
  ]);
  await bridge.finish({ ok: true });
  const actions = graphql.calls
    .map((call) => call.variables?.input?.content)
    .filter((content) => content?.type === "action");
  assert.equal(actions.length, 1);
  assert.equal(actions[0].action, "Searching the codebase");
  assert.match(actions[0].parameter, /foo/);
  assert.match(actions[0].parameter, /bar/);
  assert.equal(actions[0].result, "Done");
  assert.doesNotMatch(JSON.stringify(actions), /grep -rn/);
  assert.doesNotMatch(JSON.stringify(actions), /PASS/);
  const response = graphql.calls
    .map((call) => call.variables?.input?.content)
    .find((content) => content?.type === "response");
  assert.equal(response.body, "Implement finished on KIT-125.");
});

test("unclassified bash and lesson bodies never reach Linear", async () => {
  const graphql = fakeGraphql();
  const bridge = createAgentSessionBridge({
    env: { LINEAR_PI_ACCESS_TOKEN: "actor-token" },
    issueId: "issue-1",
    identifier: "KIT-125",
    role: "implement",
    postGraphql: graphql.postGraphql,
    coalesceMs: 60_000,
  });
  await bridge.start();
  await pump(bridge, [
    `{"type":"tool_execution_start","toolName":"bash","args":{"command":"curl -H 'Authorization: Bearer secret' https://example.test"}}`,
    JSON.stringify({
      type: "tool_execution_start",
      toolName: "memory_search",
      args: { query: "raw fontSize", text: "class → lesson dump" },
    }),
  ]);
  await bridge.finish({ ok: true });
  const contents = graphql.calls.map((call) => call.variables?.input?.content).filter(Boolean);
  assert.equal(
    contents.some((content) => JSON.stringify(content).includes("curl")),
    false,
  );
  assert.equal(
    contents.some((content) => JSON.stringify(content).includes("class → lesson")),
    false,
  );
  const memory = contents.find((content) => content.action === "Searching worker memory");
  assert.equal(memory.parameter, "raw fontSize");
});

test("GraphQL errors fail open and do not throw", async () => {
  const calls = [];
  const bridge = createAgentSessionBridge({
    env: { LINEAR_PI_ACCESS_TOKEN: "actor-token" },
    issueId: "issue-1",
    identifier: "KIT-125",
    role: "factory-checker",
    coalesceMs: 60_000,
    async postGraphql(input) {
      calls.push(input);
      throw new Error("Linear 401");
    },
  });
  await bridge.start();
  await pump(bridge, [
    '{"type":"tool_execution_start","toolName":"read","args":{"path":"apps/mobile/src/api/me.ts"}}',
  ]);
  await bridge.finish({ ok: false });
  assert.ok(calls.length >= 1);
});
