/**
 * Outbound Linear Agent Session for implement / factory-checker.
 * Proactive session on the issue (no delegate). Human-language activities only.
 * Fail open. Never use LINEAR_CLI_API_KEY or LINEAR_API_KEY.
 */
import {
  coalesceActivities,
  translatePiToolEnd,
  translatePiToolStart,
} from "./agent-activity-translate.mjs";
import { harnessLog, redactHarnessError } from "./harness-log.mjs";

export const DEFAULT_LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

export const AGENT_SESSION_CREATE_MUTATION = `mutation AgentSessionCreateOnIssue($input: AgentSessionCreateOnIssue!) {
  agentSessionCreateOnIssue(input: $input) {
    success
    agentSession { id }
  }
}`;

export const AGENT_ACTIVITY_CREATE_MUTATION = `mutation AgentActivityCreate($input: AgentActivityCreateInput!) {
  agentActivityCreate(input: $input) {
    success
  }
}`;

export const AGENT_SESSION_UPDATE_MUTATION = `mutation AgentSessionUpdate($id: String!, $input: AgentSessionUpdateInput!) {
  agentSessionUpdate(id: $id, input: $input) {
    success
  }
}`;

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function resolveLinearGraphqlUrl(env = {}) {
  const raw = env.LINEAR_GRAPHQL_URL;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  return DEFAULT_LINEAR_GRAPHQL_URL;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {string | undefined}
 */
export function readActorAppToken(env = {}) {
  const token = env.LINEAR_PI_ACCESS_TOKEN;
  return typeof token === "string" && token.trim().length > 0 ? token.trim() : undefined;
}

/**
 * @param {{
 *   url: string,
 *   token: string,
 *   query: string,
 *   variables: Record<string, unknown>,
 *   fetchImpl?: typeof fetch,
 * }} input
 */
export async function postLinearGraphql({
  url,
  token,
  query,
  variables,
  fetchImpl = globalThis.fetch,
}) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok || (Array.isArray(payload.errors) && payload.errors.length > 0)) {
    const message =
      typeof payload.errors?.[0]?.message === "string"
        ? payload.errors[0].message
        : `HTTP ${response.status}`;
    throw new Error(redactHarnessError(message) ?? "Linear GraphQL failed");
  }
  return payload.data;
}

/**
 * @param {string} role
 */
function roleLabel(role) {
  if (role === "factory-checker") {
    return "Checker";
  }
  if (role === "implement") {
    return "Implement";
  }
  return role;
}

function noopBridge() {
  return {
    async start() {},
    async consumeLine() {},
    async finish() {},
  };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   issueId?: string,
 *   identifier?: string,
 *   role?: string,
 *   postGraphql?: (input: { query: string, variables: Record<string, unknown> }) => Promise<unknown>,
 *   fetchImpl?: typeof fetch,
 *   coalesceMs?: number,
 *   log?: typeof harnessLog,
 * }} [input]
 */
export function createAgentSessionBridge({
  env = {},
  issueId,
  identifier = "unknown",
  role = "implement",
  postGraphql,
  fetchImpl,
  coalesceMs = 2500,
  log = harnessLog,
} = {}) {
  const token = readActorAppToken(env);
  const issue = typeof issueId === "string" && issueId.length > 0 ? issueId : undefined;
  if (!token || !issue) {
    return noopBridge();
  }

  const url = resolveLinearGraphqlUrl(env);
  const post =
    postGraphql ??
    ((input) =>
      postLinearGraphql({
        url,
        token,
        query: input.query,
        variables: input.variables,
        fetchImpl: fetchImpl ?? globalThis.fetch,
      }));

  let sessionId;
  let disabled = false;
  /** @type {Array<{ type: string, action: string, parameter: string, result?: string }>} */
  let pending = [];
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let flushTimer;
  let thoughtBuffer = "";

  /**
   * @param {Parameters<typeof harnessLog>[0]} row
   */
  function warn(row) {
    log({
      role,
      identifier,
      event: "fail",
      gate: "yellow",
      detail: "agent session",
      ...row,
      error: redactHarnessError(row.error) ?? row.error,
    });
  }

  /**
   * @param {Record<string, unknown>} content
   */
  async function emit(content) {
    if (disabled) {
      return;
    }
    try {
      if (!sessionId) {
        const created = await post({
          query: AGENT_SESSION_CREATE_MUTATION,
          variables: { input: { issueId: issue } },
        });
        const id = created?.agentSessionCreateOnIssue?.agentSession?.id;
        if (typeof id !== "string" || id.length === 0) {
          disabled = true;
          return;
        }
        sessionId = id;
      }
      await post({
        query: AGENT_ACTIVITY_CREATE_MUTATION,
        variables: { input: { agentSessionId: sessionId, content } },
      });
    } catch (error) {
      disabled = true;
      warn({ error });
    }
  }

  async function flushThought() {
    const body = thoughtBuffer.replace(/\s+/g, " ").trim();
    thoughtBuffer = "";
    if (body.length === 0) {
      return;
    }
    const clipped = body.length > 240 ? `${body.slice(0, 237)}…` : body;
    await emit({ type: "thought", body: redactHarnessError(clipped) ?? clipped });
  }

  async function flushActions() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
    }
    const folded = coalesceActivities(pending);
    pending = [];
    for (const row of folded) {
      await emit({
        type: "action",
        action: row.action,
        parameter: row.parameter,
        ...(typeof row.result === "string" ? { result: row.result } : {}),
      });
    }
  }

  function scheduleFlush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(() => {
      flushTimer = undefined;
      void flushActions();
    }, coalesceMs);
  }

  return {
    async start() {
      await emit({
        type: "thought",
        body: `Starting ${role === "factory-checker" ? "checker" : role} on ${identifier}.`,
      });
    },

    /**
     * @param {string} line
     */
    async consumeLine(line) {
      if (disabled) {
        return;
      }
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        return;
      }
      let event;
      try {
        event = JSON.parse(trimmed);
      } catch {
        return;
      }
      if (event === null || typeof event !== "object") {
        return;
      }
      const row = /** @type {Record<string, unknown>} */ (event);
      const type = row.type;

      if (type === "message_update") {
        const assistant = row.assistantMessageEvent;
        if (assistant && typeof assistant === "object") {
          const ev = /** @type {Record<string, unknown>} */ (assistant);
          if (ev.type === "thinking_delta" && typeof ev.delta === "string") {
            thoughtBuffer += ev.delta;
            if (thoughtBuffer.length >= 200) {
              await flushThought();
            }
          }
        }
        return;
      }

      if (type === "tool_execution_start") {
        await flushThought();
        const toolName = typeof row.toolName === "string" ? row.toolName : "";
        const args =
          row.args && typeof row.args === "object"
            ? /** @type {Record<string, unknown>} */ (row.args)
            : {};
        const activity = translatePiToolStart({ toolName, args });
        if (activity.type !== "action") {
          return;
        }
        const last = pending[pending.length - 1];
        if (last && last.action !== activity.action) {
          await flushActions();
        }
        pending.push(activity);
        scheduleFlush();
        return;
      }

      if (type === "tool_execution_end") {
        const last = pending[pending.length - 1];
        if (last) {
          const done = translatePiToolEnd({
            toolName: row.toolName,
            isError: row.isError,
            result: row.result,
          });
          last.result = done.result;
          scheduleFlush();
        }
      }
    },

    /**
     * @param {{ ok?: boolean, idleTimeout?: boolean }} [outcome]
     */
    async finish(outcome = {}) {
      await flushThought();
      await flushActions();
      if (outcome.idleTimeout === true) {
        await emit({
          type: "error",
          body: `${roleLabel(role)} stopped after a long idle period.`,
        });
        return;
      }
      if (outcome.ok === true) {
        await emit({
          type: "response",
          body: `${roleLabel(role)} finished on ${identifier}.`,
        });
        return;
      }
      await emit({
        type: "error",
        body: `${roleLabel(role)} stopped on ${identifier}.`,
      });
    },
  };
}
