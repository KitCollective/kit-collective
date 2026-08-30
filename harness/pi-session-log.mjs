/**
 * Structured session-progress logs from Pi JSON stdout (KIT-113 follow-on).
 * Emits harness JSON lines for Grafana/Loki — phases, tools, live token snapshots.
 */
import { harnessLog, redactHarnessError } from "./harness-log.mjs";

/** Factory stop-point hints for implement/checker runs (1–10). */
export const PHASE_STOP = {
  session: 1,
  scout: 2,
  draft: 3,
  helper: 4,
  gate: 5,
  implement: 6,
  checker: 8,
};

const SUBAGENT_PHASE = {
  scout: { phase: "scout", stopPoint: PHASE_STOP.scout },
  draft: { phase: "draft", stopPoint: PHASE_STOP.draft },
  gate: { phase: "gate", stopPoint: PHASE_STOP.gate },
};

/** @param {unknown} agent */
function helperPhase(agent) {
  const name = typeof agent === "string" && agent.length > 0 ? agent : "helper";
  return { phase: "helper", stopPoint: PHASE_STOP.helper, detail: name };
}

/**
 * @param {unknown} path
 */
function basenameOnly(path) {
  if (typeof path !== "string" || path.length === 0) {
    return undefined;
  }
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path.slice(0, 80);
}

/**
 * @param {unknown} command
 */
function bashDetail(command) {
  if (typeof command !== "string" || command.length === 0) {
    return "bash";
  }
  const redacted = redactHarnessError(command) ?? command;
  const oneLine = redacted.replace(/\s+/g, " ").trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 117)}…` : oneLine;
}

const MEMORY_SEARCH_TOOLS = new Set(["memory_search", "session_search"]);
const MEMORY_WRITE_TOOLS = new Set(["memory_add", "memory_replace", "memory_remove"]);

/**
 * Query only — never `text` / result hits (those can be lesson bodies).
 *
 * @param {Record<string, unknown>} args
 * @param {string} fallback
 */
function memorySearchDetail(args, fallback) {
  const query = args.query ?? args.q ?? args.search;
  if (typeof query !== "string" || query.trim().length === 0) {
    return fallback;
  }
  return bashDetail(query);
}

/**
 * Target name only — never `text` / `content` / `lesson`.
 *
 * @param {Record<string, unknown>} args
 * @param {string} fallback
 */
function memoryWriteDetail(args, fallback) {
  const target = args.target;
  if (typeof target === "string" && target.trim().length > 0 && target.length <= 40) {
    return target.trim();
  }
  return fallback;
}

/**
 * @param {Record<string, unknown>} usage
 */
function readTokenCounts(usage) {
  const input = usage.input;
  const output = usage.output;
  return {
    tokensIn: typeof input === "number" && Number.isFinite(input) ? input : undefined,
    tokensOut: typeof output === "number" && Number.isFinite(output) ? output : undefined,
  };
}

/**
 * @param {{
 *   role: string,
 *   identifier: string,
 *   log?: typeof harnessLog,
 *   now?: () => number,
 *   tokenLogIntervalMs?: number,
 * }} input
 */
export function createSessionLogCollector({
  role,
  identifier,
  log = harnessLog,
  now = () => Date.now(),
  tokenLogIntervalMs = 15_000,
}) {
  let lastTokenLogAt = 0;
  let scoutDone = false;
  let gateDone = false;
  /** @type {Map<string, { kind: "subagent" | "bash", agent?: string, command?: string }>} */
  const openTools = new Map();

  /**
   * @param {Parameters<typeof harnessLog>[0]} input
   */
  function emit(input) {
    log({ role, identifier, ...input });
  }

  /**
   * @param {unknown} toolCallId
   * @param {{ kind: "subagent" | "bash", agent?: string, command?: string }} meta
   */
  function rememberTool(toolCallId, meta) {
    if (typeof toolCallId === "string" && toolCallId.length > 0) {
      openTools.set(toolCallId, meta);
    }
  }

  /**
   * @param {unknown} toolCallId
   */
  function takeTool(toolCallId) {
    if (typeof toolCallId !== "string" || toolCallId.length === 0) {
      return undefined;
    }
    const meta = openTools.get(toolCallId);
    openTools.delete(toolCallId);
    return meta;
  }

  /**
   * @param {string} line
   */
  async function consumeLine(line) {
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

    if (type === "agent_start") {
      emit({
        event: "phase",
        gate: "yellow",
        phase: "session",
        stopPoint: PHASE_STOP.session,
        detail: "Pi session started",
      });
      return;
    }

    if (type === "agent_end") {
      emit({
        event: "phase",
        gate: "green",
        phase: "session",
        stopPoint: role === "factory-checker" ? PHASE_STOP.checker : PHASE_STOP.implement,
        detail: "Pi session ended",
      });
      return;
    }

    if (type === "tool_execution_start") {
      const toolName = typeof row.toolName === "string" ? row.toolName : "tool";
      const args =
        row.args && typeof row.args === "object"
          ? /** @type {Record<string, unknown>} */ (row.args)
          : {};

      if (toolName === "subagent") {
        const agent = args.agent;
        const mapped =
          typeof agent === "string" && agent in SUBAGENT_PHASE
            ? SUBAGENT_PHASE[/** @type {keyof typeof SUBAGENT_PHASE} */ (agent)]
            : helperPhase(agent);
        const label =
          typeof mapped.detail === "string" && mapped.detail.length > 0
            ? mapped.detail
            : mapped.phase;
        rememberTool(row.toolCallId, {
          kind: "subagent",
          agent: typeof agent === "string" ? agent : label,
        });
        emit({
          event: "phase",
          gate: "yellow",
          ...mapped,
          detail: `${label} started`,
        });
        return;
      }

      if (toolName === "bash") {
        const command = args.command ?? args.cmd;
        rememberTool(row.toolCallId, {
          kind: "bash",
          command: typeof command === "string" ? command : undefined,
        });
        emit({
          event: "tool",
          gate: "yellow",
          stopPoint: scoutDone && gateDone ? PHASE_STOP.implement : PHASE_STOP.gate,
          tool: "bash",
          detail: bashDetail(command),
        });
        return;
      }

      if (toolName === "read" || toolName === "write" || toolName === "edit") {
        const path = args.path ?? args.file;
        const base = basenameOnly(path);
        if (base) {
          emit({
            event: "tool",
            gate: "green",
            stopPoint: PHASE_STOP.implement,
            tool: toolName,
            detail: base,
          });
        }
        return;
      }

      if (MEMORY_SEARCH_TOOLS.has(toolName)) {
        emit({
          event: "tool",
          gate: "green",
          stopPoint: role === "factory-checker" ? PHASE_STOP.checker : PHASE_STOP.implement,
          tool: toolName,
          detail: memorySearchDetail(args, toolName),
        });
        return;
      }

      if (MEMORY_WRITE_TOOLS.has(toolName)) {
        emit({
          event: "tool",
          gate: "green",
          stopPoint: PHASE_STOP.checker,
          tool: toolName,
          detail: memoryWriteDetail(args, toolName),
        });
        return;
      }
    }

    if (type === "tool_execution_end") {
      const toolName = typeof row.toolName === "string" ? row.toolName : "tool";
      const isError = row.isError === true;
      const args =
        row.args && typeof row.args === "object"
          ? /** @type {Record<string, unknown>} */ (row.args)
          : {};
      const result =
        row.result && typeof row.result === "object"
          ? /** @type {Record<string, unknown>} */ (row.result)
          : {};
      const remembered = takeTool(row.toolCallId);

      if (toolName === "subagent") {
        const agent =
          (typeof args.agent === "string" && args.agent) ||
          (typeof result.agent === "string" && result.agent) ||
          remembered?.agent;
        const mapped =
          typeof agent === "string" && agent in SUBAGENT_PHASE
            ? SUBAGENT_PHASE[/** @type {keyof typeof SUBAGENT_PHASE} */ (agent)]
            : helperPhase(agent);
        if (agent === "scout") {
          scoutDone = !isError;
        }
        if (agent === "gate") {
          gateDone = !isError;
        }
        const label =
          typeof mapped.detail === "string" && mapped.detail.length > 0
            ? mapped.detail
            : mapped.phase;
        // Gate is superseded — a Gate spawn is yellow noise, not a red loop.
        const gateTone = agent === "gate" ? "yellow" : isError ? "red" : "green";
        emit({
          event: "phase",
          gate: gateTone,
          ...mapped,
          detail: isError
            ? agent === "gate"
              ? "gate failed (superseded — do not spawn)"
              : `${label} failed`
            : `${label} done`,
        });
        return;
      }

      if (toolName === "bash" && isError) {
        const command = remembered?.command ?? args.command ?? args.cmd;
        // Non-zero bash is common (format:check red, tests) — yellow, not loopRisk red.
        emit({
          event: "tool",
          gate: "yellow",
          stopPoint: PHASE_STOP.implement,
          tool: "bash",
          detail: bashDetail(command),
          error: "bash non-zero",
        });
      }
      if ((MEMORY_SEARCH_TOOLS.has(toolName) || MEMORY_WRITE_TOOLS.has(toolName)) && isError) {
        emit({
          event: "tool",
          gate: "red",
          stopPoint: role === "factory-checker" ? PHASE_STOP.checker : PHASE_STOP.implement,
          tool: toolName,
          detail: MEMORY_WRITE_TOOLS.has(toolName)
            ? memoryWriteDetail(args, toolName)
            : memorySearchDetail(args, toolName),
          error: "tool error",
        });
      }
      return;
    }

    if (type === "message_update" && row.usage && typeof row.usage === "object") {
      const at = now();
      if (at - lastTokenLogAt < tokenLogIntervalMs) {
        return;
      }
      lastTokenLogAt = at;
      const counts = readTokenCounts(/** @type {Record<string, unknown>} */ (row.usage));
      if (counts.tokensIn === undefined && counts.tokensOut === undefined) {
        return;
      }
      const stopPoint =
        role === "factory-checker"
          ? PHASE_STOP.checker
          : gateDone
            ? PHASE_STOP.implement
            : scoutDone
              ? PHASE_STOP.gate
              : PHASE_STOP.scout;
      emit({
        event: "tokens",
        gate: "green",
        stopPoint,
        phase: "live",
        ...counts,
        detail: "token snapshot",
      });
    }
  }

  return { consumeLine };
}
