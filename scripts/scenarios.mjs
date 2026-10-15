#!/usr/bin/env node
/**
 * The only way into and out of the Holdout (ADR-0060). Exit codes and the one verdict line follow ADR-0053.
 * Usage:
 *   node scripts/scenarios.mjs titles --project "<name>" --milestone "<name>" [--dir <path>]
 *       print the Scenario titles of one milestone, one per line, then the verdict line
 *   node scripts/scenarios.mjs read --project "<name>" --milestone "<name>" [--dir <path>]
 *       print every Scenario of one milestone in full, then the verdict line
 *   node scripts/scenarios.mjs put --project "<name>" --milestone "<name>" --file <draft> [--dir <path>]
 *       validate the draft, then create the milestone's Holdout file; never replaces one
 * Every `read` first appends one `holdout` line to the run log (ADR-0052, ADR-0060) with the
 * reading thread's `BB_THREAD_ID`; `titles` logs nothing. If the line cannot be written, `read`
 * prints no Scenario text and exits 4.
 * The file is `<project-slug>/<milestone-slug>.md` in the Holdout repo (`scenarios.holdoutRepo` in
 * factory.config.json, read with gh), or in `--dir` (a local clone, and the tests).
 * `put` prints no Scenario text and logs nothing. Exit 0: Scenarios printed or written, or the milestone
 * has no Holdout file. 2: usage, an unreadable or malformed file, or `put` onto an existing file. 4: the
 * Holdout cannot be read or written (gh down, no access, repo missing). Format: docs/agents/scenarios.md.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "./lib/gate-io.mjs";
import { GATE_EXIT } from "./lib/gates.mjs";
import { append, logPath } from "./lib/run-log.mjs";
import {
  checkDraft,
  parseArgs,
  putVerdict,
  refusedVerdict,
  renderResult,
} from "./lib/scenarios.mjs";

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

/** Create the milestone file in a local clone. Exits 4 when the directory is unusable. */
function putToDir(dir, path, text) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    unknown(`cannot write ${dir}: not a directory`);
  }
  const file = join(dir, path);
  try {
    mkdirSync(dirname(file), { recursive: true });
    // "wx" fails when the file exists, so create-only holds even if it appeared since the check.
    writeFileSync(file, text, { flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") {
      finish(refusedVerdict(path));
    }
    unknown(`cannot write ${file}: ${error.code ?? error.message}`);
  }
}

function putToGitHub(repo, path, text) {
  const result = spawnSync(
    "gh",
    [
      "api",
      "--method",
      "PUT",
      `repos/${repo}/contents/${path}`,
      "-f",
      `message=Add Scenarios: ${path}`,
      "-f",
      `content=${Buffer.from(text, "utf8").toString("base64")}`,
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    const cause = (result.error?.message ?? result.stderr).trim().split("\n")[0];
    unknown(`cannot write ${repo}: ${cause}`);
  }
}

/** Validate the draft, refuse an existing milestone file, then create it. */
function put({ path, dir, file }) {
  let draft;
  try {
    draft = readFileSync(file, "utf8");
  } catch (error) {
    return finish({
      code: GATE_EXIT.usage,
      lines: [`UNREADABLE: cannot read ${file}: ${error.code ?? error.message}`],
    });
  }
  const checked = checkDraft({ path, text: draft });
  if (checked.verdict) {
    return finish(checked.verdict);
  }
  if (dir) {
    putToDir(dir, path, draft);
  } else {
    const repo = config().scenarios.holdoutRepo;
    if (readFromGitHub(repo, path) !== null) {
      return finish(refusedVerdict(path));
    }
    putToGitHub(repo, path, draft);
  }
  return finish(putVerdict(path, checked.count));
}

/** One run-log line per `read`, before anything is fetched. Exits 4 when it cannot be written. */
function logRead(path) {
  const thread = process.env.BB_THREAD_ID;
  try {
    append(
      { event: "holdout", code: "holdout-read", holdout: path, ...(thread ? { thread } : {}) },
      { path: logPath() },
    );
  } catch (error) {
    unknown(`cannot log the read: ${error.message.split("\n")[0]}`);
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.error) {
  finish({ code: GATE_EXIT.usage, lines: [args.error] });
}

// Every path ends in one verdict line: an error nothing above expected is exit 4, never a stack trace.
try {
  const { command, path, dir } = args;
  if (command === "put") {
    put(args);
  }
  if (command === "read") {
    logRead(path);
  }
  const text = dir ? readFromDir(dir, path) : readFromGitHub(config().scenarios.holdoutRepo, path);
  finish(renderResult({ command, path, text }));
} catch (error) {
  unknown(`scenarios: ${error.message.split("\n")[0]}`);
}
