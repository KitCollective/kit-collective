#!/usr/bin/env node
// Runs the command hooks in .cursor/hooks.json for Claude Code (PreToolUse on Bash),
// so both tools share one set of ratchet scripts. The scripts already read
// `tool_input.command`. A deny (exit 2 or {"permission":"deny"}) blocks the command
// and its message goes to stderr, which Claude Code shows to the agent.
// A hook that crashes or prints nothing is treated as a deny, as in Cursor (failClosed).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const input = readFileSync(0, "utf8");

/** @type {{ hooks?: { beforeShellExecution?: { command: string }[] } }} */
const config = JSON.parse(readFileSync(join(root, ".cursor", "hooks.json"), "utf8"));

for (const hook of config.hooks?.beforeShellExecution ?? []) {
  const result = spawnSync("bash", ["-c", hook.command], { cwd: root, input, encoding: "utf8" });
  let verdict = { permission: "", agent_message: "" };
  try {
    verdict = JSON.parse(result.stdout.trim().split("\n").pop() ?? "");
  } catch {
    // fall through: no verdict is a deny
  }
  if (result.status === 0 && verdict.permission === "allow") {
    continue;
  }
  process.stderr.write(
    `${verdict.agent_message || `Ratchet hook gave no verdict: ${hook.command}`}\n`,
  );
  process.exit(2);
}
