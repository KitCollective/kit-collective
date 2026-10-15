#!/usr/bin/env node
/**
 * The only way into and out of the Holdout (ADR-0060). Exit codes and the one verdict line follow ADR-0053.
 * Usage:
 *   node scripts/scenarios.mjs titles --project "<name>" --milestone "<name>" [--dir <path>]
 *       print the Scenario titles of one milestone, one per line, then the verdict line
 *   node scripts/scenarios.mjs titles --issue <KEY> [--dir <path>]
 *       the same for the milestone of a Linear issue, as ONE JSON line (verdict, path, titles) so a
 *       command runner that relays only the last line carries it all; no milestone or no file: titles []
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
 *
 * Milestone scenarios (KIT-353; the bb workflow .bb/workflows/milestone-scenarios.js runs these):
 *   check --project "<name>" --milestone "<name>" --pr <n> [--dir <path>]
 *       refuse (exit 1) unless every issue of the milestone is Done or Canceled, the PR is an open
 *       development → staging PR and the milestone has Scenarios; else ONE JSON line (path, sha, titles,
 *       runsPerScenario, nonce). Reads titles only: no Holdout read is logged.
 *   score --scenarios <n> --verdicts <i>:<s|n>:<run>,...   the score as one JSON line; exit 0 met, 1 not
 *   status --sha <sha> (--state pending | --state error [--code c] [--run id] | --scenarios n --verdicts list) [--dry-run]
 *       post the `Scenarios` commit status; the state of a verdict list is worked out, never passed in
 *   flow --name <name>          dispatch scenario-flow.yml with .factory/scenario-flows/<name>.yaml, wait for it
 *   run --flow-run <id> --name <name>   dispatch device-flows.yml as an artifact run of that flow
 *   wait --runs <ids> --sha <sha> [--timeout s]   exit 3 while a run is unfinished; 0 with the evidence downloaded
 * None of them prints a flow's text or a Scenario's text. Exit codes and lines: docs/agents/scenarios.md.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config, linearCli, linearIssue, sh } from "./lib/gate-io.mjs";
import { GATE_EXIT } from "./lib/gates.mjs";
import { append, logPath } from "./lib/run-log.mjs";
import {
  checkDraft,
  ERROR_CODES,
  FULL_SHA,
  MAX_FLOW_CHARS,
  MILESTONE_USAGE,
  PENDING_DESCRIPTION,
  parseArgs,
  parseScenarios,
  parseVerdicts,
  putVerdict,
  refusedVerdict,
  refuseMilestoneIssues,
  refusePromotionPr,
  renderIssueTitles,
  renderResult,
  runOutcome,
  scenarioPath,
  scoreVerdicts,
  statusPayload,
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

// ---- Milestone scenarios (KIT-353) ---------------------------------------------------------------

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Where the judge writes flows and `wait` puts evidence: the checkout's gitignored `.factory/`. */
const workDir = () => process.env.KC_SCENARIO_WORK || join(ROOT, ".factory");
const pollMs = () => Number(process.env.KC_POLL_SECONDS ?? 15) * 1000;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const firstLine = (text) =>
  String(text ?? "")
    .trim()
    .split("\n")[0];
const APP_ID = /^appId:[ \t]*app\.kitcollective\.mobile[ \t]*$/m;
const usageLine = (command, problem) => ({
  code: GATE_EXIT.usage,
  lines: [
    `USAGE: ${problem ? `${problem}: ` : ""}node scripts/scenarios.mjs ${MILESTONE_USAGE[command]}`,
  ],
});
const oneLine = (code, answer) => finish({ code, lines: [JSON.stringify(answer)] });

function ghCall(args, input) {
  return spawnSync("gh", args, {
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** A gh api answer as JSON; exit 4 naming `what` when gh fails or answers something else. */
function ghJson(args, what) {
  const result = ghCall(args);
  if (result.status !== 0) {
    return unknown(`cannot read ${what}: ${firstLine(result.error?.message ?? result.stderr)}`);
  }
  try {
    return JSON.parse(result.stdout || "{}");
  } catch {
    return unknown(`cannot read ${what}: the answer is not JSON`);
  }
}

/**
 * Starts a workflow on the integration lane. The body goes on stdin, so the inputs (a flow's text)
 * never appear in a command line or a log; `return_run_details` asks GitHub for the run's id.
 * @returns {number | null} the run id, or null when the answer has none
 */
function dispatch(workflow, inputs) {
  const cfg = config();
  const body = { ref: cfg.lanes.integration, inputs, return_run_details: true };
  const result = ghCall(
    [
      "api",
      "--method",
      "POST",
      `repos/${cfg.github.ownerRepo}/actions/workflows/${workflow}/dispatches`,
      "--input",
      "-",
    ],
    JSON.stringify(body),
  );
  if (result.status !== 0) {
    unknown(`cannot dispatch ${workflow}: ${firstLine(result.error?.message ?? result.stderr)}`);
  }
  try {
    const id = JSON.parse(result.stdout || "{}").workflow_run_id;
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/** The milestone may be judged: every issue finished, the PR is the promotion, the Holdout has Scenarios. */
async function check({ path, pr, project, milestone, dir }) {
  const cfg = config();
  let issues;
  try {
    issues = JSON.parse(
      await sh("node", [
        linearCli(),
        "list",
        "--project",
        project,
        "--milestone",
        milestone,
        "--limit",
        "250",
      ]),
    );
  } catch (error) {
    unknown(`cannot list the milestone's issues: ${firstLine(error.stderr || error.message)}`);
  }
  if (!Array.isArray(issues)) {
    unknown("cannot list the milestone's issues: the answer is not a list");
  }
  const notDone = refuseMilestoneIssues(issues, { project, milestone });
  if (notDone) {
    finish({ code: GATE_EXIT.closed, lines: [notDone] });
  }
  const view = ghCall([
    "pr",
    "view",
    String(pr),
    "--repo",
    cfg.github.ownerRepo,
    "--json",
    "state,baseRefName,headRefName,headRefOid",
  ]);
  if (view.status !== 0) {
    unknown(`cannot read PR #${pr}: ${firstLine(view.error?.message ?? view.stderr)}`);
  }
  let facts;
  try {
    facts = JSON.parse(view.stdout);
  } catch {
    unknown(`cannot read PR #${pr}: the answer is not JSON`);
  }
  const wrongPr = refusePromotionPr(facts, pr, cfg.lanes);
  if (wrongPr) {
    finish({ code: GATE_EXIT.closed, lines: [wrongPr] });
  }
  if (!FULL_SHA.test(String(facts.headRefOid))) {
    unknown(`cannot read PR #${pr}: no head sha`);
  }
  const text = dir ? readFromDir(dir, path) : readFromGitHub(cfg.scenarios.holdoutRepo, path);
  if (text === null) {
    finish({
      code: GATE_EXIT.closed,
      lines: [`REFUSED: ${path}: no Holdout file, so no Scenarios to judge`],
    });
  }
  const parsed = parseScenarios(text);
  if (parsed.problems) {
    finish(renderResult({ command: "check", path, text }));
  }
  const n = parsed.scenarios.length;
  oneLine(GATE_EXIT.open, {
    verdict: `SCENARIOS check ${path}: ${n} Scenario${n === 1 ? "" : "s"} on ${facts.headRefOid.slice(0, 8)}`,
    path,
    sha: facts.headRefOid,
    titles: parsed.scenarios.map((s) => s.title),
    runsPerScenario: cfg.scenarios.runsPerScenario,
    nonce: randomBytes(4).toString("hex"),
  });
}

/** The score of a verdict list, or the usage verdict that refuses the list. */
function scoreOf(command, { scenarios, verdicts }) {
  const { runsPerScenario, satisfiedToMeet } = config().scenarios;
  const parsed = parseVerdicts(verdicts, { scenarios, runsPerScenario });
  if (parsed.problem) {
    finish(usageLine(command, parsed.problem));
  }
  return scoreVerdicts(parsed.entries, { scenarios: Number(scenarios), satisfiedToMeet });
}

function score(args) {
  const { description: _d, state: _s, ...answer } = scoreOf("score", args);
  oneLine(answer.passed ? GATE_EXIT.open : GATE_EXIT.closed, answer);
}

/** Posts the `Scenarios` status on the sha: pending, error with a fixed code, or the verdicts' score. */
function status(args) {
  const cfg = config();
  let scored = null;
  let state = args.state;
  let description = PENDING_DESCRIPTION;
  let run = args.run;
  if (args.verdicts !== undefined) {
    scored = scoreOf("status", args);
    ({ state, description, run } = scored);
  } else if (state === "error") {
    description = ERROR_CODES[args.code];
  }
  const payload = statusPayload({ state, description, run, ownerRepo: cfg.github.ownerRepo });
  if (!args.dryRun) {
    const fields = Object.entries(payload).flatMap(([key, value]) => ["-f", `${key}=${value}`]);
    const posted = ghCall([
      "api",
      "--method",
      "POST",
      `repos/${cfg.github.ownerRepo}/statuses/${args.sha}`,
      ...fields,
    ]);
    if (posted.status !== 0) {
      unknown(
        `cannot post the Scenarios status: ${firstLine(posted.error?.message ?? posted.stderr)}`,
      );
    }
  }
  const { description: _d, verdict: _v, ...score } = scored ?? {};
  oneLine(state === "failure" ? GATE_EXIT.closed : GATE_EXIT.open, {
    verdict: `SCENARIOS status ${state} ${args.sha.slice(0, 8)}: ${description}`,
    state,
    posted: !args.dryRun,
    ...(args.dryRun ? { payload } : {}),
    ...score,
  });
}

/** The producer run of one flow name, found by its run name (`Scenario flow <name>`, unique per name). */
async function producerRunByName(name) {
  const repo = config().github.ownerRepo;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const runs = ghJson(
      [
        "api",
        `repos/${repo}/actions/workflows/scenario-flow.yml/runs?event=workflow_dispatch&per_page=50`,
      ],
      "the Scenario flow runs",
    );
    const found = (runs.workflow_runs ?? []).find(
      (r) => r.display_title === `Scenario flow ${name}`,
    );
    if (found && Number.isInteger(found.id)) {
      return found.id;
    }
    await sleep(pollMs());
  }
  return unknown(
    `the dispatch of scenario-flow.yml for ${name} returned no run id and no run is named for it`,
  );
}

/** Turns the judge's flow file into the run artifact `scenario-flow-<name>` (scenario-flow.yml). */
async function flow({ name, timeout = 420 }) {
  const file = join(workDir(), "scenario-flows", `${name}.yaml`);
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    finish({
      code: GATE_EXIT.usage,
      lines: [`UNREADABLE: no flow file for ${name}: ${error.code ?? error.message}`],
    });
  }
  // From here the flow is in memory only; the copy that stays is the artifact (KIT-366).
  rmSync(file, { force: true });
  if (!APP_ID.test(text) || text.length > MAX_FLOW_CHARS) {
    finish({
      code: GATE_EXIT.usage,
      lines: [
        `MALFORMED: the flow ${name} has no "appId: app.kitcollective.mobile" line or is over ${MAX_FLOW_CHARS} characters`,
      ],
    });
  }
  const id = dispatch("scenario-flow.yml", { name, flow: text }) ?? (await producerRunByName(name));
  const repo = config().github.ownerRepo;
  const started = Date.now();
  for (;;) {
    const run = ghJson(["api", `repos/${repo}/actions/runs/${id}`], `run ${id}`);
    if (run.status === "completed") {
      if (run.conclusion === "success") {
        oneLine(GATE_EXIT.open, { verdict: `SCENARIOS flow ${name}: run ${id}`, name, run: id });
      }
      finish({
        code: GATE_EXIT.closed,
        lines: [`FAILED: the producer run ${id} of ${name} concluded ${run.conclusion}`],
      });
    }
    if (Date.now() - started + pollMs() > timeout * 1000) {
      unknown(`the producer run ${id} of ${name} did not finish in ${timeout}s`);
    }
    await sleep(pollMs());
  }
}

/** One hosted Device flows run of the named flow, from its artifact, on the integration lane. */
function runFlow({ flowRun, name }) {
  const id = dispatch("device-flows.yml", {
    flows: "artifact",
    flow_run: flowRun,
    flow_artifact: `scenario-flow-${name}`,
  });
  if (id === null) {
    unknown(
      "the dispatch of device-flows.yml returned no run id (return_run_details); device-flows.yml has no run name to find the run by, so none is guessed",
    );
  }
  oneLine(GATE_EXIT.open, { verdict: `SCENARIOS run ${name}: run ${id}`, run: id });
}

/** Frames of every recording under `dir`, when ffmpeg is there: the judge cannot watch a video. */
function extractFrames(dir) {
  const ffmpeg = process.env.KC_FFMPEG || "ffmpeg";
  if (spawnSync(ffmpeg, ["-version"], { stdio: "ignore" }).status !== 0) {
    return false;
  }
  const frames = join(dir, "frames");
  let any = false;
  for (const entry of readdirSync(dir, { recursive: true })) {
    if (!String(entry).endsWith(".mp4")) {
      continue;
    }
    mkdirSync(frames, { recursive: true });
    const stem = basename(String(entry), ".mp4");
    const done = spawnSync(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        join(dir, String(entry)),
        "-vf",
        "fps=1/2",
        "-frames:v",
        "60",
        join(frames, `${stem}-%03d.png`),
      ],
      { stdio: "ignore" },
    );
    any = any || done.status === 0;
  }
  return any;
}

/** Waits for the hosted runs; when all are judged, downloads each run's evidence. */
async function wait({ runs, sha, timeout = 480 }) {
  const repo = config().github.ownerRepo;
  const started = Date.now();
  const outcomes = new Map();
  for (;;) {
    for (const id of runs.filter((r) => !outcomes.has(r))) {
      const run = ghJson(["api", `repos/${repo}/actions/runs/${id}`], `run ${id}`);
      const jobs =
        run.status === "completed"
          ? ghJson(["api", `repos/${repo}/actions/runs/${id}/jobs`], `the jobs of run ${id}`)
          : null;
      const answer = runOutcome({ id, run, jobs, sha });
      if (answer.error) {
        finish({ code: GATE_EXIT.closed, lines: [`ERROR: ${answer.error}: ${answer.line}`] });
      }
      if (answer.outcome !== "waiting") {
        outcomes.set(id, answer.outcome);
      }
    }
    const unfinished = runs.length - outcomes.size;
    if (unfinished === 0) {
      break;
    }
    if (Date.now() - started + pollMs() > timeout * 1000) {
      finish({
        code: GATE_EXIT.waiting,
        lines: [`WAITING: ${unfinished} of ${runs.length} hosted runs unfinished`],
      });
    }
    await sleep(pollMs());
  }
  const artifact = `device-flows-${sha}`;
  const answer = [];
  for (const id of runs) {
    const evidence = join(workDir(), "scenario-runs", String(id));
    rmSync(evidence, { recursive: true, force: true });
    mkdirSync(evidence, { recursive: true });
    const got = ghCall([
      "run",
      "download",
      String(id),
      "--repo",
      repo,
      "--name",
      artifact,
      "--dir",
      evidence,
    ]);
    if (got.status !== 0) {
      finish({
        code: GATE_EXIT.closed,
        lines: [
          `ERROR: hosted-run-error: run ${id} has no artifact device-flows-${sha.slice(0, 8)} (${firstLine(got.error?.message ?? got.stderr)})`,
        ],
      });
    }
    answer.push({ run: id, outcome: outcomes.get(id), evidence, frames: extractFrames(evidence) });
  }
  oneLine(GATE_EXIT.open, {
    verdict: `SCENARIOS wait: ${runs.length} hosted runs finished on ${sha.slice(0, 8)}`,
    runs: answer,
  });
}

const MILESTONE_COMMANDS = { check, score, status, flow, run: runFlow, wait };

const args = parseArgs(process.argv.slice(2));
if (args.error) {
  finish({ code: GATE_EXIT.usage, lines: [args.error] });
}

// Every path ends in one verdict line: an error nothing above expected is exit 4, never a stack trace.
try {
  const { command, dir } = args;
  if (command in MILESTONE_COMMANDS) {
    await MILESTONE_COMMANDS[command](args);
  }
  let { path } = args;
  if (args.issue) {
    let linear;
    try {
      linear = await linearIssue(args.issue);
    } catch (error) {
      unknown(`cannot read ${args.issue} from Linear: ${error.message.split("\n")[0]}`);
    }
    path =
      linear?.project && linear?.milestone ? scenarioPath(linear.project, linear.milestone) : null;
    if (path === null) {
      finish(renderIssueTitles({ path, text: null }));
    }
  }
  if (command === "put") {
    put(args);
  }
  if (command === "read") {
    logRead(path);
  }
  const text = dir ? readFromDir(dir, path) : readFromGitHub(config().scenarios.holdoutRepo, path);
  finish(args.issue ? renderIssueTitles({ path, text }) : renderResult({ command, path, text }));
} catch (error) {
  unknown(`scenarios: ${error.message.split("\n")[0]}`);
}
