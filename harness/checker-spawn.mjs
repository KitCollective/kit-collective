/**
 * Factory checker Pi spawn allowlist (KIT-56).
 * Mechanical deny for write/edit/general bash; Linear CLI is a registered host tool.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const FACTORY_CHECKER_TOOLS = join(HARNESS_DIR, "factory-checker-tools.ts");

/** @readonly */
export const FACTORY_CHECKER_EXCLUDED_TOOLS = ["write", "edit", "bash"];

/** @readonly */
export const FACTORY_CHECKER_MEMORY_TOOLS = [
  "memory_search",
  "session_search",
  "memory_add",
  "memory_replace",
  "memory_remove",
];

/** Read-only Slop sub-agent — no memory writes (KIT-126). */
export const SLOP_AGENT_MEMORY_EXCLUDED_TOOLS = ["memory_add", "memory_replace", "memory_remove"];

/** Mirrors `.pi/agents/slop.md` frontmatter `tools:` — keep in sync. */
export const SLOP_AGENT_ALLOWED_TOOLS = ["read", "grep", "find", "ls"];

/**
 * Pi CLI tool gate for the read-only Slop sub-agent (`.pi/agents/slop.md`).
 * pi-subagents honors agent frontmatter; this is the harness source of truth.
 *
 * @returns {string[]}
 */
export function slopAgentToolArgs() {
  return [
    "--no-builtin-tools",
    "--tools",
    SLOP_AGENT_ALLOWED_TOOLS.join(","),
    "--exclude-tools",
    SLOP_AGENT_MEMORY_EXCLUDED_TOOLS.join(","),
  ];
}

/** Env the Slop child extension reads — must call `slopAgentToolArgs()` here. */
export const SLOP_AGENT_PI_ARGS_ENV = "SLOP_AGENT_PI_ARGS";

/**
 * Wire mechanical Slop child tool deny at factory-checker spawn.
 *
 * @param {Record<string, string | undefined>} spawnEnv
 */
export function applySlopAgentSpawnEnv(spawnEnv) {
  spawnEnv.SLOP_AGENT_MEMORY_EXCLUDED_TOOLS = SLOP_AGENT_MEMORY_EXCLUDED_TOOLS.join(",");
  spawnEnv[SLOP_AGENT_PI_ARGS_ENV] = slopAgentToolArgs().join("\0");
}

/** @readonly */
export const FACTORY_CHECKER_ALLOWED_TOOLS = [
  "read",
  "grep",
  "find",
  "ls",
  "subagent",
  "linear_cli",
  "gh_cli",
  ...FACTORY_CHECKER_MEMORY_TOOLS,
];

/**
 * Extra pi CLI args for factory-checker (tool gate + extension).
 * Extension path is this module's directory (repo `harness/`, image `/app`).
 *
 * @returns {string[]}
 */
export function factoryCheckerToolArgs() {
  return [
    "--no-builtin-tools",
    "--tools",
    FACTORY_CHECKER_ALLOWED_TOOLS.join(","),
    "--exclude-tools",
    FACTORY_CHECKER_EXCLUDED_TOOLS.join(","),
    "-e",
    FACTORY_CHECKER_TOOLS,
  ];
}

/**
 * @param {{
 *   workspace: string,
 *   roleFile: string,
 *   model: string,
 *   prompt: string,
 * }} input
 * @returns {string[]}
 */
export function factoryCheckerPiArgs({ workspace, roleFile, model, prompt }) {
  return [
    "-p",
    "-a",
    "--model",
    model,
    ...factoryCheckerToolArgs(),
    "--append-system-prompt",
    join(workspace, roleFile),
    "--",
    prompt,
  ];
}
