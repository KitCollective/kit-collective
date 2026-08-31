/**
 * Temporary OpenRouter model pins on `.pi/agents/*.md` for an economy stay.
 * Restores originals after Pi exits so write-scope / git stay clean.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ECONOMY_PINNED_AGENTS,
  economyAgentModelSpec,
  rewriteAgentModelFrontmatter,
} from "./model-router.mjs";

/**
 * @param {string} agentsDir absolute path to `.pi/agents`
 * @param {number} [rotationIndex]
 * @returns {() => void} restore originals
 */
export function applyEconomyAgentPins(agentsDir, rotationIndex = 0) {
  /** @type {Map<string, string>} */
  const backups = new Map();
  if (typeof agentsDir !== "string" || agentsDir.length === 0) {
    return () => {};
  }
  for (const name of ECONOMY_PINNED_AGENTS) {
    const path = join(agentsDir, name);
    try {
      const original = readFileSync(path, "utf8");
      const pins = economyAgentModelSpec(name, rotationIndex);
      backups.set(path, original);
      writeFileSync(path, rewriteAgentModelFrontmatter(original, pins), "utf8");
    } catch {
      // Missing agent in this worktree — skip.
    }
  }
  return () => {
    for (const [path, original] of backups) {
      try {
        writeFileSync(path, original, "utf8");
      } catch {
        // Best-effort restore.
      }
    }
  };
}
