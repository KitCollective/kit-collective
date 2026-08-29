/**
 * Structured session-progress logs from Pi JSON stdout (KIT-113 follow-on).
 * Emits harness JSON lines for Grafana/Loki — phases, tools, live token snapshots.
 */
import { harnessLog, redactHarnessError } from "./harness-log.mjs";

/** Factory stop-point hints for implement/checker runs (1–10). */
export const PHASE_STOP = {
  session: 1,
  scout: 2,
  helper: 3,
  gate: 4,
  implement: 6,
  checker: 8,
};

const SUBAGENT_PHASE = {
  scout: { phase: "scout", stopPoint: PHASE_STOP.scout },
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
  tokenLogIntervalMs = 30_000,
}) {
  let lastTokenLogAt = 0;
  let scoutDone = false;
  let gateDone = false;

  /**
   * @param {Parameters<typeof harnessLog>[0]} input
   */
  function emit(input) {
    log({ role, identifier, ...input });
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
        emit({
          event: "phase",
          gate: "yellow",
          ...mapped,
          detail: `${mapped.phase} started`,
        });
        return;
      }

      if (toolName === "bash") {
        const command = args.command ?? args.cmd;
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

      if (toolName === "subagent") {
        const agent = args.agent ?? result.agent;
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
        emit({
          event: "phase",
          gate: isError ? "red" : "green",
          ...mapped,
          detail: isError ? `${mapped.phase} failed` : `${mapped.phase} done`,
        });
        return;
      }

      if (toolName === "bash" && isError) {
        emit({
          event: "tool",
          gate: "red",
          stopPoint: PHASE_STOP.implement,
          tool: "bash",
          detail: "bash failed",
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
