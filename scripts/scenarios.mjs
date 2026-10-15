#!/usr/bin/env node
/**
 * The only reader of the Holdout (ADR-0060). Exit codes and the one verdict line follow ADR-0053.
 * Usage:
 *   node scripts/scenarios.mjs titles --project "<name>" --milestone "<name>" [--dir <path>]
 *       print the Scenario titles of one milestone, one per line, then the verdict line
 *   node scripts/scenarios.mjs read --project "<name>" --milestone "<name>" [--dir <path>]
 *       print every Scenario of one milestone in full, then the verdict line
 * The file is `<project-slug>/<milestone-slug>.md` in the Holdout repo (`scenarios.holdoutRepo` in
 * factory.config.json, read with gh), or in `--dir` (a local clone, and the tests).
 * Exit 0: Scenarios printed, or the milestone has no Holdout file. 2: usage or malformed file. 4: the
 * Holdout cannot be read (gh down, no access, repo missing). Format: docs/agents/scenarios.md.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { config } from "./lib/gate-io.mjs";
import { GATE_EXIT } from "./lib/gates.mjs";
import { parseArgs, renderResult } from "./lib/scenarios.mjs";

function finish({ code, lines }) {
  process.stdout.write(`${lines.join("\n")}\n`);
  process.exit(code);
}

const unknown = (cause) => finish({ code: GATE_EXIT.unknown, lines: [`UNKNOWN: ${cause}`] });

/** The file's text, or null when the Holdout has no file for the milestone. Exits 4 when unreadable. */
function readFromDir(dir, path) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    unknown(`cannot read ${dir}: not a directory`);
  }
  const file = join(dir, path);
  if (!existsSync(file)) {
    return null;
  }
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    return unknown(`cannot read ${file}: ${error.code ?? error.message}`);
  }
}

function readFromGitHub(repo, path) {
  const gh = (args) => spawnSync("gh", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const file = gh([
    "api",
    "-H",
    "Accept: application/vnd.github.raw",
    `repos/${repo}/contents/${path}`,
  ]);
  if (file.status === 0) {
    return file.stdout;
  }
  const failure = (result) => (result.error?.message ?? result.stderr).trim().split("\n")[0];
  if (file.error || !/HTTP 404/.test(file.stderr)) {
    unknown(`cannot read ${repo}: ${failure(file)}`);
  }
  // A 404 on the file is "no Holdout file" only when the repo itself answers.
  const probe = gh(["api", `repos/${repo}`]);
  if (probe.status !== 0) {
    unknown(`cannot read ${repo}: ${failure(probe)}`);
  }
  return null;
}

const args = parseArgs(process.argv.slice(2));
if (args.error) {
  finish({ code: GATE_EXIT.usage, lines: [args.error] });
}

// Every path ends in one verdict line: an error nothing above expected is exit 4, never a stack trace.
try {
  const { command, path, dir } = args;
  const text = dir ? readFromDir(dir, path) : readFromGitHub(config().scenarios.holdoutRepo, path);
  finish(renderResult({ command, path, text }));
} catch (error) {
  unknown(`scenarios: ${error.message.split("\n")[0]}`);
}
