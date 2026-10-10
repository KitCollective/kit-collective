#!/usr/bin/env node
/**
 * Sync a PR branch with the integration lane, no human (ADR-0054). Run from the PR's worktree
 * on the PR's branch, with nothing uncommitted, while holding the merge lock.
 *
 * Usage: node scripts/sync-pr.mjs sync <pr>
 *        node scripts/sync-pr.mjs valid <audited-sha> --pr <pr>
 *   Both require the local HEAD to equal the PR head (by SHA) and say so when it does not.
 *   sync   CURRENT (already holds the lane), SYNCED (lane merged in, pushed; checks rerun),
 *          CONFLICT (nothing committed or pushed; files named), CLOSED (could not work, or the PR
 *          is not open or is on another branch). Never rebases, never forces.
 *   valid  AUDIT-VALID when only clean automatic merges of the lane were added since the audited
 *          commit, AUDIT-STALE otherwise (new work, hand-resolved merge, not on the lane).
 * Exit: 0 CURRENT, SYNCED or AUDIT-VALID; 1 CONFLICT, CLOSED or AUDIT-STALE; 2 usage.
 */
import { execFileSync } from "node:child_process";
import { auditStillValid, syncBound, syncBranch } from "./lib/sync-pr.mjs";

const [action, arg] = process.argv.slice(2);
const prAt = process.argv.indexOf("--pr");
const prArg = prAt === -1 ? undefined : process.argv[prAt + 1];
const cwd = process.cwd();
const base = JSON.parse(
  execFileSync(
    "node",
    ["-e", "process.stdout.write(JSON.stringify(require('./factory.config.json').lanes))"],
    { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" },
  ),
).integration;
let result;
if (action === "sync" && /^\d+$/.test(arg ?? "")) {
  try {
    const view = JSON.parse(
      execFileSync(
        "gh",
        ["pr", "view", arg, "--json", "state,headRefName,headRefOid,baseRefName,isCrossRepository"],
        { cwd, encoding: "utf8" },
      ),
    );
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
    }).trim();
    if (view.state !== "OPEN") {
      result = { code: 1, line: `CLOSED (sync): PR ${arg} is ${view.state}` };
    } else if (view.isCrossRepository || view.baseRefName !== base) {
      result = {
        code: 1,
        line: `CLOSED (sync): PR ${arg} is from another repository or not into ${base}`,
      };
    } else if (branch !== view.headRefName) {
      result = {
        code: 1,
        line: `CLOSED (sync): on ${branch}, the PR branch is ${view.headRefName}`,
      };
    } else {
      const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
      const bound = syncBound({ head, prHead: view.headRefOid });
      result = bound.ok ? syncBranch({ cwd, base }) : { code: 1, line: bound.line };
    }
  } catch (error) {
    result = { code: 1, line: `CLOSED (sync): ${String(error.message).split("\n")[0]}` };
  }
} else if (action === "valid" && /^[0-9a-f]{7,40}$/i.test(arg ?? "") && /^\d+$/.test(prArg ?? "")) {
  try {
    const view = JSON.parse(
      execFileSync("gh", ["pr", "view", prArg, "--json", "headRefOid"], { cwd, encoding: "utf8" }),
    );
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
    const bound = syncBound({ head, prHead: view.headRefOid, verb: "AUDIT-STALE" });
    result = bound.ok
      ? auditStillValid({ cwd, audited: arg, base })
      : { code: 1, line: bound.line };
  } catch (error) {
    result = { code: 1, line: `AUDIT-STALE: ${String(error.message).split("\n")[0]}` };
  }
} else {
  process.stderr.write("usage: sync-pr.mjs sync <pr> | valid <audited-sha> --pr <pr>\n");
  process.exit(2);
}
process.stdout.write(`${result.line}\n`);
process.exit(result.code);
