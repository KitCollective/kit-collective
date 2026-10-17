#!/usr/bin/env node
/**
 * Runs one named live check (scripts/lib/live-checks.mjs) from this checkout and prints one verdict line:
 *   LIVE-CHECK <name> pass|fail <last output line>
 *
 *   node scripts/live-check.mjs list
 *   node scripts/live-check.mjs run <name> [--thread thr_x]
 *
 * Exit: 0 pass, 1 fail, 2 usage (an unknown check or a missing thread).
 */
import { spawnSync } from "node:child_process";
import { LIVE_CHECKS, liveCheckSteps } from "./lib/live-checks.mjs";

const [command, name, ...rest] = process.argv.slice(2);
const flag = (key) => {
  const at = rest.indexOf(key);
  return at === -1 ? undefined : rest[at + 1];
};

if (command === "list") {
  for (const [key, check] of Object.entries(LIVE_CHECKS)) {
    process.stdout.write(`${key}${check.needsThread ? " --thread thr_x" : ""}: ${check.what}\n`);
  }
  process.exit(0);
}
if (command !== "run" || !name) {
  process.stderr.write("usage: live-check.mjs list | run <name> [--thread thr_x]\n");
  process.exit(2);
}

let steps;
try {
  steps = liveCheckSteps(name, { thread: flag("--thread") });
} catch (error) {
  process.stdout.write(`LIVE-CHECK ${name} usage ${error.message}\n`);
  process.exit(2);
}

let last = "";
for (const [cmd, ...args] of steps) {
  const result = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const lines = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  last = lines.at(-1) ?? "";
  if (result.status !== 0) {
    const why = result.error
      ? result.error.message
      : `${cmd} ${args.join(" ")} exited ${result.status}`;
    process.stdout.write(`LIVE-CHECK ${name} fail ${why}: ${last.slice(0, 300)}\n`);
    process.exit(1);
  }
}
process.stdout.write(`LIVE-CHECK ${name} pass ${last.slice(0, 300)}\n`);
