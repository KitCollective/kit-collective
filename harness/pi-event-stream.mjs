/**
 * Map Pi JSON mode stdout into Linear AgentSession activities (KIT-79).
 * Fake Pi fixtures at this seam; do not spawn a model in tests.
 */

const MAX_THOUGHT_CHARS = 500;
const MAX_PARAM_CHARS = 120;

/**
 * @param {unknown} args
 * @returns {string}
 */
export function summarizeToolArgs(args) {
  if (args === null || args === undefined) {
    return "";
  }
  let text;
  try {
    text = typeof args === "string" ? args : JSON.stringify(args);
  } catch {
    return "";
  }
  if (text.length <= MAX_PARAM_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_PARAM_CHARS - 1)}…`;
}

/**
 * @param {string} text
 * @param {number} [max]
 */
export function truncateText(text, max = MAX_THOUGHT_CHARS) {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

/**
 * @param {object | null | undefined} event
 * @returns {{ type: "thought", body: string, ephemeral: true } | { type: "action", action: string, parameter: string, ephemeral: true } | null}
 */
export function mapPiEventToActivity(event) {
  if (event === null || typeof event !== "object") {
    return null;
  }
  if (event.type === "tool_execution_start") {
    const toolName = typeof event.toolName === "string" ? event.toolName : "tool";
    return {
      type: "action",
      action: toolName,
      parameter: summarizeToolArgs(event.args),
    };
  }
  if (event.type === "message_update") {
    const assistantEvent = event.assistantMessageEvent;
    if (assistantEvent?.type === "toolcall_start" && typeof assistantEvent.toolName === "string") {
      return {
        type: "action",
        action: assistantEvent.toolName,
        parameter: "",
      };
    }
  }
  return null;
}

/**
 * @param {{
 *   session?: { emitStream?: Function },
 *   issueId?: string,
 *   minIntervalMs?: number,
 *   now?: () => number,
 *   schedule?: (fn: () => void, ms: number) => unknown,
 *   clearSchedule?: (handle: unknown) => void,
 * }} [deps]
 */
export function createPiEventStreamConsumer({
  session,
  issueId,
  minIntervalMs = 300,
  now = () => Date.now(),
  schedule = (fn, ms) => setTimeout(fn, ms),
  clearSchedule = (handle) => clearTimeout(handle),
} = {}) {
  let thinkingBuffer = "";
  let lastEmitAt = 0;
  /** @type {unknown} */
  let flushTimer = null;

  /**
   * @param {{ type: string, body?: string, action?: string, parameter?: string }} content
   */
  async function emitActivity(content) {
    if (typeof session?.emitStream !== "function" || typeof issueId !== "string") {
      return;
    }
    try {
      await session.emitStream({ issueId, content, ephemeral: true });
    } catch {
      // Stream failures must not fail the Pi job or the Issue webhook path.
    }
  }

  /**
   * @param {boolean} [force]
   */
  async function flushThinking(force = false) {
    const body = thinkingBuffer.trim();
    if (!body) {
      return;
    }
    const timestamp = now();
    if (!force && timestamp - lastEmitAt < minIntervalMs) {
      return;
    }
    thinkingBuffer = "";
    lastEmitAt = timestamp;
    await emitActivity({
      type: "thought",
      body: truncateText(body),
    });
  }

  function scheduleThinkingFlush() {
    if (flushTimer !== null) {
      return;
    }
    flushTimer = schedule(async () => {
      flushTimer = null;
      await flushThinking(true);
    }, minIntervalMs);
  }

  return {
    /**
     * @param {string} line
     */
    async consumeLine(line) {
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
      if (event?.type === "session") {
        return;
      }
      if (event?.type === "tool_execution_start") {
        if (flushTimer !== null) {
          clearSchedule(flushTimer);
          flushTimer = null;
        }
        await flushThinking(true);
        const mapped = mapPiEventToActivity(event);
        if (mapped) {
          await emitActivity(mapped);
        }
        return;
      }
      if (event?.type === "message_update") {
        const assistantEvent = event.assistantMessageEvent;
        if (assistantEvent?.type === "thinking_delta" && typeof assistantEvent.delta === "string") {
          thinkingBuffer += assistantEvent.delta;
          scheduleThinkingFlush();
          return;
        }
        const mapped = mapPiEventToActivity(event);
        if (mapped) {
          await emitActivity(mapped);
        }
      }
    },
    async finish() {
      if (flushTimer !== null) {
        clearSchedule(flushTimer);
        flushTimer = null;
      }
      await flushThinking(true);
    },
  };
}

/**
 * @param {import("node:stream").Readable} readable
 * @param {{ consumeLine: (line: string) => Promise<void>, finish?: () => Promise<void> }} consumer
 */
export async function pipeReadableJsonLines(readable, consumer) {
  let buffer = "";
  for await (const chunk of readable) {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      await consumer.consumeLine(line);
      newlineIndex = buffer.indexOf("\n");
    }
  }
  if (buffer.length > 0) {
    await consumer.consumeLine(buffer);
  }
  if (typeof consumer.finish === "function") {
    await consumer.finish();
  }
}

export const STREAMING_ROLES = new Set(["implement", "factory-checker"]);
