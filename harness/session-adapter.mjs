/**
 * Display-only Linear AgentSession adapter (KIT-59).
 *
 * Posts thought / ephemeral action / elicitation so the issue UI is live.
 * Never enqueues a coding job. Durable evidence stays on the workpad.
 * Fake Linear at this seam; do not call Pi.
 */

export const CREATED_UNCLAIMED_THOUGHT =
  "Factory coding jobs start only from the Issue status webhook after a planner claim. This session is display-only.";
export const CREATED_CLAIMED_THOUGHT =
  "Pi is working from the Issue webhook. This AgentSession is display-only.";
export const PROMPTED_THOUGHT =
  "This session does not enqueue a coding job. Durable evidence stays on the workpad.";
export const HANDOFF_ELICITATION = "Ready for merge. This is Nicklas's turn.";

/**
 * Issue-webhook paths have issueId, not sessionId. Look the live AgentSession up
 * on Linear so ephemeral activity still posts after a restart or a race with created.
 *
 * @param {{ getAgentSessionId?: Function }} [linear]
 * @param {Map<string, string>} sessionsByIssue
 * @param {{ sessionId?: string, issueId?: string }} input
 * @returns {Promise<string | undefined>}
 */
async function resolveSessionId(linear, sessionsByIssue, { sessionId, issueId }) {
  if (typeof sessionId === "string" && sessionId.length > 0) {
    return sessionId;
  }
  if (typeof issueId === "string") {
    const cached = sessionsByIssue.get(issueId);
    if (typeof cached === "string" && cached.length > 0) {
      return cached;
    }
  }
  if (typeof linear?.getAgentSessionId !== "function" || typeof issueId !== "string") {
    return undefined;
  }
  try {
    const lookedUp = await linear.getAgentSessionId(issueId);
    if (typeof lookedUp === "string" && lookedUp.length > 0) {
      sessionsByIssue.set(issueId, lookedUp);
      return lookedUp;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * @param {{ linear?: { clearDelegate?: Function, createAgentActivity?: Function, getAgentSessionId?: Function, updateAgentSession?: Function } }} [deps]
 */
export function createMemorySessionAdapter({ linear } = {}) {
  const activities = [];
  const sessionsByIssue = new Map();
  const adapter = {
    activities,
    handedOff: false,
    ackedAt: undefined,
    /**
     * @param {{ sessionId: string, issueId?: string, claimed?: boolean, now?: number }} input
     */
    async ackCreated({ sessionId, issueId, claimed = false, now = Date.now() }) {
      adapter.ackedAt = now;
      if (typeof issueId === "string") {
        sessionsByIssue.set(issueId, sessionId);
      }
      activities.push({
        sessionId,
        ephemeral: false,
        content: {
          type: "thought",
          body: claimed ? CREATED_CLAIMED_THOUGHT : CREATED_UNCLAIMED_THOUGHT,
        },
      });
    },
    /**
     * @param {{ sessionId: string, now?: number }} input
     */
    async ackPrompted({ sessionId, now = Date.now() }) {
      adapter.ackedAt = now;
      activities.push({
        sessionId,
        ephemeral: false,
        content: { type: "thought", body: PROMPTED_THOUGHT },
      });
    },
    /**
     * Ephemeral Pi child stream line. Never updates the workpad.
     *
     * @param {{ issueId: string, sessionId?: string, content: object, ephemeral?: boolean }} input
     */
    async emitStream({ issueId, sessionId, content, ephemeral = true }) {
      const resolved = await resolveSessionId(linear, sessionsByIssue, { sessionId, issueId });
      if (typeof resolved !== "string") {
        return;
      }
      activities.push({
        sessionId: resolved,
        ephemeral,
        content,
      });
    },
    /**
     * @param {{ issueId?: string, identifier: string, role: string, sessionId?: string }} input
     */
    async emitWorking({ issueId, identifier, role, sessionId }) {
      const resolved = await resolveSessionId(linear, sessionsByIssue, { sessionId, issueId });
      if (role === "implement") {
        activities.push({
          sessionId: resolved,
          ephemeral: true,
          content: { type: "action", action: "Implementing", parameter: identifier },
        });
        return;
      }
      if (role === "factory-checker") {
        activities.push({
          sessionId: resolved,
          ephemeral: true,
          content: { type: "thought", body: `Factory checker is reviewing ${identifier}.` },
        });
      }
    },
    /**
     * @param {{ issueId: string, identifier?: string, sessionId?: string }} input
     */
    async handOff({ issueId, sessionId }) {
      adapter.handedOff = true;
      const resolved = await resolveSessionId(linear, sessionsByIssue, { sessionId, issueId });
      activities.push({
        sessionId: resolved,
        ephemeral: false,
        content: { type: "elicitation", body: HANDOFF_ELICITATION },
      });
      if (typeof linear?.clearDelegate === "function") {
        await linear.clearDelegate({ issueId });
      }
    },
  };
  return adapter;
}

/**
 * Production adapter: Linear CLI mutations only. Never updateWorkpad.
 *
 * @param {{ linear: { createAgentActivity: Function, clearDelegate: Function, getAgentSessionId?: Function, updateAgentSession?: Function } }} deps
 */
export function createLinearSessionAdapter({ linear }) {
  const memory = createMemorySessionAdapter({ linear });
  return {
    get activities() {
      return memory.activities;
    },
    get handedOff() {
      return memory.handedOff;
    },
    get ackedAt() {
      return memory.ackedAt;
    },
    async ackCreated(input) {
      await memory.ackCreated(input);
      const last = memory.activities.at(-1);
      if (typeof linear.createAgentActivity === "function" && last) {
        await linear.createAgentActivity({
          sessionId: input.sessionId,
          content: last.content,
          ephemeral: last.ephemeral,
        });
      }
    },
    async ackPrompted(input) {
      await memory.ackPrompted(input);
      const last = memory.activities.at(-1);
      if (typeof linear.createAgentActivity === "function" && last) {
        await linear.createAgentActivity({
          sessionId: input.sessionId,
          content: last.content,
          ephemeral: last.ephemeral,
        });
      }
    },
    async emitStream(input) {
      await memory.emitStream(input);
      const last = memory.activities.at(-1);
      const sessionId = last?.sessionId ?? input.sessionId;
      if (
        typeof linear.createAgentActivity === "function" &&
        last &&
        typeof sessionId === "string"
      ) {
        try {
          await linear.createAgentActivity({
            sessionId,
            content: last.content,
            ephemeral: last.ephemeral,
          });
        } catch {
          // Stream path failures must not fail the Issue webhook or Pi job.
        }
      }
    },
    async emitWorking(input) {
      await memory.emitWorking(input);
      const last = memory.activities.at(-1);
      const sessionId = last?.sessionId ?? input.sessionId;
      if (
        typeof linear.createAgentActivity === "function" &&
        last &&
        typeof sessionId === "string"
      ) {
        try {
          await linear.createAgentActivity({
            sessionId,
            content: last.content,
            ephemeral: last.ephemeral,
          });
        } catch {
          // Session display failures must not fail the Issue webhook or Pi job enqueue.
        }
      }
    },
    async handOff(input) {
      await memory.handOff(input);
      const last = memory.activities.at(-1);
      const sessionId = last?.sessionId ?? input.sessionId;
      if (
        typeof linear.createAgentActivity === "function" &&
        last &&
        typeof sessionId === "string"
      ) {
        await linear.createAgentActivity({
          sessionId,
          content: last.content,
          ephemeral: last.ephemeral,
        });
      }
    },
  };
}
