/**
 * Temporary OpenRouter model pins on `.pi/agents/*.md` for an economy stay.
 * Caller must restore before any worktree git (rebase/commit) — dirty pins block rebase.
 * While pinned, mark paths skip-worktree so the parent does not see a dirty harness and
 * start meta-debugging agent frontmatter (write-scope never includes `.pi/agents`).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ECONOMY_PINNED_AGENTS,
  economyAgentModelSpec,
  rewriteAgentModelFrontmatter,
} from "./model-router.mjs";

/**
 * @param {string} cwd
 * @param {string[]} relPaths
 * @param {boolean} skip
 */
function setSkipWorktree(cwd, relPaths, skip) {
  if (typeof cwd !== "string" || cwd.length === 0 || relPaths.length === 0) {
    return;
  }
  const flag = skip ? "--skip-worktree" : "--no-skip-worktree";
  spawnSync("git", ["update-index", flag, ...relPaths], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
}

/**
 * @param {string} agentsDir absolute path to `.pi/agents`
 * @param {number} [rotationIndex]
 * @param {{ gitCwd?: string }} [options] worktree root for skip-worktree (usually checkout.path)
 * @returns {() => void} restore originals (safe to call more than once)
 */
export function applyEconomyAgentPins(agentsDir, rotationIndex = 0, options = {}) {
  /** @type {Map<string, string>} */
  const backups = new Map();
  /** @type {string[]} */
  const relSkip = [];
  const gitCwd = typeof options.gitCwd === "string" ? options.gitCwd : "";
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
      relSkip.push(join(".pi/agents", name));
    } catch {
      // Missing agent in this worktree — skip.
    }
  }
  if (gitCwd.length > 0 && relSkip.length > 0) {
    setSkipWorktree(gitCwd, relSkip, true);
  }
  let restored = false;
  return () => {
    if (restored) {
      return;
    }
    restored = true;
    for (const [path, original] of backups) {
      try {
        writeFileSync(path, original, "utf8");
      } catch {
        // Best-effort restore.
      }
    }
    if (gitCwd.length > 0 && relSkip.length > 0) {
      setSkipWorktree(gitCwd, relSkip, false);
    }
  };
}
