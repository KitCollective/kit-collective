/**
 * Read-only Slop sub-agent Pi extension (KIT-126).
 * Loads only in the Slop child via `.pi/agents/slop.md` `subagentOnlyExtensions`.
 * Denies memory writes using harness spawn env from `applySlopAgentSpawnEnv`.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const SLOP_AGENT_MEMORY_EXCLUDED_TOOLS_ENV = "SLOP_AGENT_MEMORY_EXCLUDED_TOOLS";
export const SLOP_AGENT_PI_ARGS_ENV = "SLOP_AGENT_PI_ARGS";

/** @readonly */
export const DEFAULT_SLOP_MEMORY_DENY = ["memory_add", "memory_replace", "memory_remove"];

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {Set<string>}
 */
export function slopMemoryDeniedTools(env = process.env) {
  const raw = env[SLOP_AGENT_MEMORY_EXCLUDED_TOOLS_ENV];
  if (typeof raw !== "string" || raw.length === 0) {
    return new Set(DEFAULT_SLOP_MEMORY_DENY);
  }
  return new Set(
    raw
      .split(",")
      .map((tool) => tool.trim())
      .filter(Boolean),
  );
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function slopSpawnEnvWired(env = process.env) {
  const excluded = env[SLOP_AGENT_MEMORY_EXCLUDED_TOOLS_ENV];
  const piArgs = env[SLOP_AGENT_PI_ARGS_ENV];
  return typeof excluded === "string" && excluded.length > 0 && typeof piArgs === "string" && piArgs.length > 0;
}

export default function slopAgentTools(pi: ExtensionAPI) {
  if (!slopSpawnEnvWired()) {
    throw new Error(
      "slop child requires SLOP_AGENT_MEMORY_EXCLUDED_TOOLS and SLOP_AGENT_PI_ARGS from factory-checker spawn",
    );
  }

  const denied = slopMemoryDeniedTools();

  pi.on("tool_call", async (event) => {
    const name = event.toolName.toLowerCase();
    if (denied.has(name)) {
      return { block: true, reason: "slop child: memory writes denied" };
    }
    return undefined;
  });
}
