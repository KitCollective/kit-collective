/**
 * Map Pi tool-calls to Linear Agent Activity content.
 * Human verb + relevant context. Never raw CLI, stdout, or secrets.
 */
import { redactHarnessError } from "./harness-log.mjs";

const SKIP = { type: "skip" };

/**
 * @param {unknown} path
 * @returns {string | undefined}
 */
function basenameOnly(path) {
  if (typeof path !== "string" || path.length === 0) {
    return undefined;
  }
  const parts = path.split(/[/\\]/);
  const base = parts[parts.length - 1];
  return base && base.length > 0 ? base : undefined;
}

/**
 * @param {string} command
 * @returns {string | undefined}
 */
function firstQuoted(command) {
  const match = command.match(/'([^']+)'|"([^"]+)"/);
  const value = match?.[1] ?? match?.[2];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * @param {unknown} command
 * @returns {{ type: "action", action: string, parameter: string } | { type: "skip" }}
 */
function translateBash(command) {
  if (typeof command !== "string" || command.trim().length === 0) {
    return SKIP;
  }
  const redacted = redactHarnessError(command) ?? command;
  const compact = redacted.replace(/\s+/g, " ").trim();
  if (compact.length === 0) {
    return SKIP;
  }

  if (/\b(grep|rg|find)\b/.test(compact)) {
    const needle = firstQuoted(compact);
    return {
      type: "action",
      action: "Searching the codebase",
      parameter: needle ?? "the worktree",
    };
  }

  if (/\b(pnpm test|npm test|node --test|vitest)\b/.test(compact)) {
    const file = compact.match(/([\w./-]+\.test\.[jt]sx?)/);
    return {
      type: "action",
      action: "Running tests",
      parameter: file?.[1] ? (basenameOnly(file[1]) ?? file[1]) : "the suite",
    };
  }

  if (/\b(format:check|biome ci|biome check)\b/.test(compact)) {
    return { type: "action", action: "Checking format", parameter: "the worktree" };
  }

  if (/\bgit rebase\b/.test(compact)) {
    return { type: "action", action: "Rebasing the branch", parameter: "onto development" };
  }
  if (/\bgit commit\b/.test(compact)) {
    return { type: "action", action: "Committing changes", parameter: "the worktree" };
  }
  if (/\bgit push\b/.test(compact)) {
    return { type: "action", action: "Pushing the branch", parameter: "the pull request" };
  }
  if (/\bgit add\b/.test(compact)) {
    return { type: "action", action: "Staging changes", parameter: "the worktree" };
  }

  if (/\bgh pr\b/.test(compact)) {
    return { type: "action", action: "Checking the pull request", parameter: "this issue" };
  }

  return SKIP;
}

/**
 * @param {{ toolName?: unknown, args?: Record<string, unknown> }} input
 * @returns {{ type: "action", action: string, parameter: string } | { type: "skip" }}
 */
export function translatePiToolStart(input = {}) {
  const toolName = typeof input.toolName === "string" ? input.toolName : "";
  const args = input.args && typeof input.args === "object" ? input.args : {};

  if (toolName === "bash") {
    return translateBash(args.command ?? args.cmd);
  }

  if (toolName === "read") {
    const name = basenameOnly(args.path ?? args.file);
    if (!name) {
      return SKIP;
    }
    return { type: "action", action: "Reading a file", parameter: name };
  }

  if (toolName === "write" || toolName === "edit") {
    const name = basenameOnly(args.path ?? args.file);
    if (!name) {
      return SKIP;
    }
    return { type: "action", action: "Editing a file", parameter: name };
  }

  if (toolName === "subagent") {
    const agent = typeof args.agent === "string" ? args.agent : "helper";
    if (agent === "scout") {
      return { type: "action", action: "Scouting the codebase", parameter: "read-only recon" };
    }
    if (agent === "gate") {
      return {
        type: "action",
        action: "Running pre-review checks",
        parameter: "rebase and checks",
      };
    }
    return { type: "action", action: "Asking a helper", parameter: agent };
  }

  if (toolName === "memory_search" || toolName === "session_search") {
    const query = args.query ?? args.q ?? args.search;
    if (typeof query !== "string" || query.trim().length === 0) {
      return { type: "action", action: "Searching worker memory", parameter: "lessons" };
    }
    const oneLine = query.replace(/\s+/g, " ").trim();
    return {
      type: "action",
      action: "Searching worker memory",
      parameter: oneLine.length > 80 ? `${oneLine.slice(0, 77)}…` : oneLine,
    };
  }

  return SKIP;
}

/**
 * @param {{ toolName?: unknown, isError?: unknown, result?: unknown }} input
 * @returns {{ result: string }}
 */
export function translatePiToolEnd(input = {}) {
  if (input.isError === true) {
    return { result: "Failed" };
  }
  return { result: "Done" };
}

/**
 * Fold consecutive actions with the same verb into one line.
 *
 * @param {Array<{ type?: string, action?: string, parameter?: string, result?: string }>} activities
 * @returns {Array<{ type: string, action: string, parameter: string, result?: string }>}
 */
export function coalesceActivities(activities = []) {
  /** @type {Array<{ type: string, action: string, parameter: string, result?: string }>} */
  const out = [];
  for (const row of activities) {
    if (!row || row.type !== "action" || typeof row.action !== "string") {
      continue;
    }
    const parameter = typeof row.parameter === "string" ? row.parameter : "";
    const last = out[out.length - 1];
    if (last && last.action === row.action) {
      const parts = new Set(
        last.parameter
          .split(", ")
          .map((part) => part.trim())
          .filter(Boolean),
      );
      if (parameter.length > 0) {
        parts.add(parameter);
      }
      last.parameter = [...parts].slice(0, 4).join(", ");
      if (typeof row.result === "string") {
        last.result = row.result;
      }
      continue;
    }
    out.push({
      type: "action",
      action: row.action,
      parameter,
      ...(typeof row.result === "string" ? { result: row.result } : {}),
    });
  }
  return out;
}
