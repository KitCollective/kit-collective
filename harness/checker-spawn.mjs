/**
 * Factory checker Pi spawn allowlist (KIT-56).
 * Mechanical deny for write/edit/general bash; Linear CLI is a registered host tool.
 */
import { join } from "node:path";

/** @readonly */
export const FACTORY_CHECKER_EXCLUDED_TOOLS = ["write", "edit", "bash"];

/** @readonly */
export const FACTORY_CHECKER_ALLOWED_TOOLS = ["read", "grep", "find", "ls", "linear_cli"];

/**
 * Extra pi CLI args for factory-checker (tool gate + extension).
 *
 * @param {{ workspace: string }} input
 * @returns {string[]}
 */
export function factoryCheckerToolArgs({ workspace }) {
  return [
    "--no-builtin-tools",
    "--tools",
    FACTORY_CHECKER_ALLOWED_TOOLS.join(","),
    "--exclude-tools",
    FACTORY_CHECKER_EXCLUDED_TOOLS.join(","),
    "-e",
    join(workspace, "harness/factory-checker-tools.ts"),
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
    ...factoryCheckerToolArgs({ workspace }),
    "--append-system-prompt",
    join(workspace, roleFile),
    "--",
    prompt,
  ];
}
