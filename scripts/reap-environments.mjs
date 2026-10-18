#!/usr/bin/env node
/**
 * Reaps the issue worktrees on the runs machine whose issue is Done, Canceled or Duplicate
 * (ADR-0066): archives the environment's threads, then asks bb to delete the environment, which
 * removes the worktree. Without --apply it only prints the plan.
 *
 * Usage: node scripts/reap-environments.mjs [--apply] [--machine host_x] [--keep env_a,env_b]
 * The dispatcher's environment (DISPATCH_ENVIRONMENT, default env_4qvy25k89t) is always kept.
 * Prints one line per reaped worktree and a summary. Exit 0, or 4 when bb or Linear cannot be read.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { planReap } from "./lib/reap-environments.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const apply = args.includes("--apply");
const machine = option("--machine", process.env.RUNS_MACHINE ?? "host_new78xp362");
const keep = [
  process.env.DISPATCH_ENVIRONMENT ?? "env_4qvy25k89t",
  ...String(option("--keep", "")).split(",").filter(Boolean),
];
const bb = process.env.BB_CLI ?? "bb";
const run = (cmd, argv) => execFileSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 26 });

let environments;
try {
  const listed = JSON.parse(run(bb, ["environment", "list", "--json"]));
  environments = Array.isArray(listed) ? listed : (listed.environments ?? []);
} catch (error) {
  process.stdout.write(
    `REAP unknown: bb environment list failed: ${String(error.message).split("\n")[0]}\n`,
  );
  process.exit(4);
}

const states = new Map();
const stateOf = (issue) => {
  if (!states.has(issue)) {
    try {
      const out = JSON.parse(run("node", [join(ROOT, "scripts", "linear.mjs"), "issue", issue]));
      states.set(issue, out.state ?? null);
    } catch {
      states.set(issue, null);
    }
  }
  return states.get(issue);
};

const plan = planReap(environments, { machine, keep, stateOf });
let reaped = 0;
for (const { id, issue, state } of plan.reap) {
  if (!apply) {
    process.stdout.write(`would reap ${id} (${issue} ${state})\n`);
    continue;
  }
  try {
    run(bb, ["environment", "archive-threads", id]);
    run(bb, ["environment", "delete", id]);
    reaped += 1;
    process.stdout.write(`reaped ${id} (${issue} ${state})\n`);
  } catch (error) {
    process.stdout.write(`kept ${id} (${issue}): ${String(error.message).split("\n")[0]}\n`);
  }
}
process.stdout.write(
  `REAP ${apply ? `reaped ${reaped} of ${plan.reap.length}` : `would reap ${plan.reap.length}`}, kept ${plan.keep.length} on ${machine}\n`,
);
