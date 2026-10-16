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
 * Milestone scenarios (KIT-353, KIT-354; the bb workflow .bb/workflows/milestone-scenarios.js runs these):
 *   check --project "<name>" --milestone "<name>" --pr <n> [--dir <path>]
 *       refuse (exit 1) unless every issue of the milestone is Done or Canceled, the PR is an open
 *       development → staging PR and the milestone has Scenarios; else ONE JSON line (path, sha, titles,
 *       runsPerScenario, nonce). Reads titles only: no Holdout read is logged.
 *   report --project "<name>" --milestone "<name>" --sha <sha> --scenarios <n> --verdicts <list> [--dir <path>] [--dry-run]
 *       after the score: one issue per failed Scenario in the milestone (none for a Scenario that
 *       already has an open failure issue), then one comment on the project; ONE JSON line
 *   score --scenarios <n> --verdicts <i>:<s|n>:<run>,...   the score as one JSON line; exit 0 met, 1 not
 *   status --sha <sha> (--state pending | --state error [--code c] [--run id] | --scenarios n --verdicts list) [--dry-run]
 *       post the `Scenarios` commit status; the state of a verdict list is worked out, never passed in
 *   flow --name <name>          dispatch the Holdout repo's scenario-flow.yml with
 *       .factory/scenario-flows/<name>.yaml, wait for it (the artifact is made in the Holdout, KIT-366)
 *   run --flow-run <id> --name <name>   dispatch device-flows.yml as an artifact run of that flow
 *   wait --runs <ids> --sha <sha> [--timeout s]   exit 3 while a run is unfinished; 0 with the evidence downloaded
 *   evidence --dir <path>       on the hosted runner: keep only kc__ files of Maestro's output (KIT-366)
 *   access                      prove the token split: the gh login cannot read the Holdout, the CLI can
 * None of them prints a flow's text or a Scenario's text. Exit codes and lines: docs/agents/scenarios.md.
 *
 * Every call to the Holdout repo (titles, read, put, check, report, flow) runs gh with GH_TOKEN set to
 * SCENARIOS_GH_TOKEN (the env, else the main checkout's `.env`), a token that selects the Holdout only;
 * unset (the approver's Mac), the gh login is used. Calls to kit-collective never carry it (KIT-366).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config, linearCli, linearIssue, sh } from "./lib/gate-io.mjs";
import { GATE_EXIT } from "./lib/gates.mjs";
import { append, logPath } from "./lib/run-log.mjs";
import {
  checkDraft,
  cleanSentence,
  ERROR_CODES,
  FLOW_NAME,
  FULL_SHA,
  failureIssueBody,
  failureTitle,
  HOLDOUT_REF,
  HOLDOUT_TOKEN_NAME,
  MAX_FLOW_CHARS,
  MILESTONE_USAGE,
  milestoneComment,
  openFailureIssue,
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
  retellsScenario,
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The main checkout's `.env` (a worktree shares it), or the file `KC_ENV_FILE` names (the tests). */
function envFile() {
  if (process.env.KC_ENV_FILE) {
    return process.env.KC_ENV_FILE;
  }
  const common = spawnSync(
    "git",
    ["-C", ROOT, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf8" },
  );
  return join(common.status === 0 ? dirname(common.stdout.trim()) : ROOT, ".env");
}

/** SCENARIOS_GH_TOKEN from the env, else from the main checkout's `.env` (as linear.mjs reads its key); or null. */
let cachedToken;
function holdoutToken() {
  if (cachedToken === undefined) {
    cachedToken = process.env[HOLDOUT_TOKEN_NAME] || tokenFromEnvFile();
  }
  return cachedToken;
}

function tokenFromEnvFile() {
  try {
    const assignment = new RegExp(`^\\s*(?:export\\s+)?${HOLDOUT_TOKEN_NAME}\\s*=\\s*(.*?)\\s*$`);
    for (const line of readFileSync(envFile(), "utf8").split("\n")) {
      const match = assignment.exec(line);
      if (match) {
        return match[1].replace(/^(['"])(.*)\1$/, "$2") || null;
      }
    }
  } catch {
    // No `.env`: no token.
  }
  return null;
}

/** The env of a gh call to the Holdout repo: GH_TOKEN is the Holdout token when there is one. */
function holdoutEnv() {
  const token = holdoutToken();
  return token ? { ...process.env, GH_TOKEN: token } : process.env;
}

/** Appended to a failed Holdout call's cause when no Holdout token was used. */
const tokenHint = () =>
  holdoutToken() ? "" : ` (${HOLDOUT_TOKEN_NAME} is not set, so the gh login was used)`;

function readFromGitHub(repo, path) {
  const env = holdoutEnv();
  const gh = (args) =>
    spawnSync("gh", args, { encoding: "utf8", env, maxBuffer: 16 * 1024 * 1024 });
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
    unknown(`cannot read ${repo}: ${failure(file)}${tokenHint()}`);
  }
  // A 404 on the file is "no Holdout file" only when the repo itself answers.
  const probe = gh(["api", `repos/${repo}`]);
  if (probe.status !== 0) {
    unknown(`cannot read ${repo}: ${failure(probe)}${tokenHint()}`);
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
    { encoding: "utf8", env: holdoutEnv(), maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    const cause = (result.error?.message ?? result.stderr).trim().split("\n")[0];
    unknown(`cannot write ${repo}: ${cause}${tokenHint()}`);
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

/**
 * gh, stopped after `timeoutMs` (default two minutes) so no call can hold a slice past its cap.
 * `env` is the process env (kit-collective, the gh login) unless a Holdout call passes holdoutEnv().
 */
function ghCall(args, input, timeoutMs = 120000, env = process.env) {
  return spawnSync("gh", args, {
    encoding: "utf8",
    env,
    input,
    maxBuffer: 64 * 1024 * 1024,
    timeout: Math.max(1, timeoutMs),
  });
}

/** A gh api answer as JSON; exit 4 naming `what` when gh fails or answers something else. */
function ghJson(args, what, deadline, env = process.env) {
  // A read near the deadline still gets 5 s; the caller stops reading POLL_GRACE after it.
  const limit = deadline ? Math.max(5000, Math.min(60000, deadline - Date.now())) : undefined;
  const result = ghCall(args, undefined, limit, env);
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
 * Starts a workflow, by default in kit-collective on the integration lane. The body goes on stdin,
 * so the inputs (a flow's text) never appear in a command line or a log; `return_run_details` asks
 * GitHub for the run's id. The producer passes the Holdout repo, its ref and holdoutEnv().
 * @returns {number | null} the run id, or null when the answer has none
 */
function dispatch(workflow, inputs, { repo, ref, env } = {}) {
  const cfg = config();
  const body = { ref: ref ?? cfg.lanes.integration, inputs, return_run_details: true };
  const result = ghCall(
    [
      "api",
      "--method",
      "POST",
      `repos/${repo ?? cfg.github.ownerRepo}/actions/workflows/${workflow}/dispatches`,
      "--input",
      "-",
    ],
    JSON.stringify(body),
    undefined,
    env,
  );
  if (result.status !== 0) {
    unknown(
      `cannot dispatch ${workflow}: ${firstLine(result.error?.message ?? result.stderr)}${repo ? tokenHint() : ""}`,
    );
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

/** The entries of a verdict list, or the usage verdict that refuses the list. */
function verdictEntries(command, { scenarios, verdicts }) {
  const parsed = parseVerdicts(verdicts, {
    scenarios,
    runsPerScenario: config().scenarios.runsPerScenario,
  });
  if (parsed.problem) {
    finish(usageLine(command, parsed.problem));
  }
  return parsed.entries;
}

const scoreEntries = (entries, scenarios) =>
  scoreVerdicts(entries, {
    scenarios: Number(scenarios),
    satisfiedToMeet: config().scenarios.satisfiedToMeet,
  });

/** The score of a verdict list, or the usage verdict that refuses the list. */
const scoreOf = (command, args) => scoreEntries(verdictEntries(command, args), args.scenarios);

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

/**
 * The judge's sentence for a run (`scenario-sentences/<run>.txt` in the work dir), or null when it
 * is unusable or retells a Scenario (shares RETELL_WORDS consecutive words with its text).
 */
function sentenceFile(run, sections) {
  const file = join(workDir(), "scenario-sentences", `${run}.txt`);
  try {
    const sentence = cleanSentence(readFileSync(file, "utf8"));
    return {
      file,
      sentence: sentence && !retellsScenario(sentence, sections) ? sentence : null,
    };
  } catch {
    return { file, sentence: null };
  }
}

/** A failed `linear.mjs` call; thrown so `finally` blocks run, then reported as exit 4. */
class LinearFailure extends Error {}

/** `linear.mjs <args>`, its stdout; throws LinearFailure naming the cause. `done` names what was written already. */
async function linear(args, what, done = "") {
  try {
    return await sh("node", [linearCli(), ...args]);
  } catch (error) {
    throw new LinearFailure(`cannot ${what}: ${firstLine(error.stderr || error.message)}${done}`);
  }
}

/** A text for `linear.mjs --body-file`: a temp file outside the repo, removed after `use`. */
async function withBodyFile(text, use) {
  const dir = mkdtempSync(join(tmpdir(), "kc-report-"));
  const file = join(dir, "body.md");
  writeFileSync(file, text, { mode: 0o600 });
  try {
    return await use(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * After the score: one To-do `ready-for-agent` issue per failed Scenario in the same milestone, then
 * one comment on the project. The titles are the only thing taken from the Holdout (the full text is
 * never read here, so no `holdout` read is logged and none could leak); the sentences are the run
 * judges', read from files and used in issue bodies only. A Scenario with an open failure issue is
 * not filed again. An existing issue is never moved. Nothing is written when anything is unclear;
 * a failure part-way names what was filed, and running `report` again files only what is missing.
 */
async function report({ path, project, milestone, sha, scenarios, verdicts, dir, dryRun }) {
  const cfg = config();
  const entries = verdictEntries("report", { scenarios, verdicts });
  const scored = scoreEntries(entries, scenarios);
  const text = dir ? readFromDir(dir, path) : readFromGitHub(cfg.scenarios.holdoutRepo, path);
  if (text === null) {
    finish({
      code: GATE_EXIT.usage,
      lines: [`MALFORMED: ${path}: no Holdout file, so no Scenario titles`],
    });
  }
  const parsed = parseScenarios(text);
  if (parsed.problems) {
    finish(renderResult({ command: "report", path, text }));
  }
  const titles = parsed.scenarios.map((s) => s.title);
  if (titles.length !== scored.scenarios.length) {
    finish({
      code: GATE_EXIT.usage,
      lines: [
        `MALFORMED: ${path}: the Holdout has ${titles.length} Scenario${titles.length === 1 ? "" : "s"}, the run judged ${scored.scenarios.length}`,
      ],
    });
  }

  const failed = scored.scenarios.filter((s) => !s.met).map((s) => s.index);
  const sections = parsed.scenarios.flatMap((s) => s.sections);
  const sentences = new Map(entries.map((e) => [e.run, sentenceFile(e.run, sections)]));

  let issues = [];
  if (failed.length > 0) {
    const listed = await linear(
      ["list", "--project", project, "--milestone", milestone, "--limit", "250"],
      "list the milestone's issues",
    );
    try {
      issues = JSON.parse(listed);
    } catch {
      issues = null;
    }
    if (!Array.isArray(issues)) {
      unknown("cannot list the milestone's issues: the answer is not a list");
    }
  }

  const filed = [];
  const existing = [];
  const wouldFile = [];
  for (const index of failed) {
    const title = titles[index - 1];
    const open = openFailureIssue(issues, title);
    if (open) {
      existing.push(open.identifier);
      continue;
    }
    if (dryRun) {
      wouldFile.push(failureTitle(title));
      continue;
    }
    const body = failureIssueBody({
      title,
      ownerRepo: cfg.github.ownerRepo,
      sha,
      scenarioRuns: entries
        .filter((e) => e.index === index)
        .map((e) => ({
          run: e.run,
          satisfied: e.satisfied,
          sentence: sentences.get(e.run).sentence,
        })),
    });
    const made = await withBodyFile(body, (file) =>
      linear(
        [
          "create",
          failureTitle(title),
          "--body-file",
          file,
          "--state",
          "To-do",
          "--label",
          "ready-for-agent",
          "--project",
          project,
          "--milestone",
          milestone,
        ],
        `file the failure issue of Scenario ${index}`,
        filed.length > 0
          ? ` (filed already: ${filed.join(", ")}; run report again to file the rest)`
          : "",
      ),
    );
    const key = /^([A-Z][A-Z0-9]*-\d+)\b/.exec(made.trim())?.[1];
    if (!key) {
      unknown(
        `the failure issue of Scenario ${index} was filed but linear.mjs answered no issue key`,
      );
    }
    filed.push(key);
  }

  const verdict = `SCENARIOS report ${sha.slice(0, 8)}: Satisfaction ${scored.satisfaction}, ${filed.length} issue${filed.length === 1 ? "" : "s"} filed, ${existing.length} already open`;
  if (dryRun) {
    oneLine(GATE_EXIT.open, {
      verdict,
      satisfaction: scored.satisfaction,
      dryRun: true,
      comment: false,
      wouldFile,
      existing,
    });
  }
  const comment = milestoneComment({
    milestone,
    sha,
    satisfaction: scored.satisfaction,
    failed: failed.map((index) => titles[index - 1]),
    filed,
    existing,
  });
  await withBodyFile(comment, (file) =>
    linear(
      ["project-comment", project, "--body-file", file],
      "comment on the project",
      filed.length > 0 ? ` (filed already: ${filed.join(", ")})` : "",
    ),
  );
  for (const { file } of sentences.values()) {
    rmSync(file, { force: true });
  }
  oneLine(GATE_EXIT.open, {
    verdict,
    satisfaction: scored.satisfaction,
    comment: true,
    filed,
    existing,
  });
}

/**
 * The producer run of one flow name in the Holdout repo, found by its run name (`Scenario flow
 * <name>`, unique per name).
 */
async function producerRunByName(name) {
  const repo = config().scenarios.holdoutRepo;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const runs = ghJson(
      [
        "api",
        `repos/${repo}/actions/workflows/scenario-flow.yml/runs?event=workflow_dispatch&per_page=50`,
      ],
      "the Scenario flow runs",
      undefined,
      holdoutEnv(),
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

/**
 * Turns the judge's flow file into the run artifact `scenario-flow-<name>` of the Holdout repo's
 * producer (its scenario-flow.yml on HOLDOUT_REF), with the Holdout token: the flow's text and its
 * artifact never touch kit-collective (KIT-366).
 */
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
  const repo = config().scenarios.holdoutRepo;
  const env = holdoutEnv();
  const id =
    dispatch("scenario-flow.yml", { name, flow: text }, { repo, ref: HOLDOUT_REF, env }) ??
    (await producerRunByName(name));
  const started = Date.now();
  for (;;) {
    const run = ghJson(["api", `repos/${repo}/actions/runs/${id}`], `run ${id}`, undefined, env);
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
      finish({
        code: GATE_EXIT.closed,
        lines: [`FAILED: the producer run ${id} of ${name} did not finish in ${timeout}s`],
      });
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

/** True when spawnSync stopped the child at its `timeout`. */
const timedOut = (result) => result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM";

/** What a judge may see of a run: the step screenshots, the recording and (later) its stills. */
const EVIDENCE_FILE = /^kc__[^/]*\.(png|mp4)$/;

/**
 * Maestro saves the screen at a failing step as `<flow>/screenshots/step-NNN-<command>-<text>.png`,
 * a name that holds flow text. Renames each to `kc__<flow>__failure-NN.png` in the same folder,
 * numbered in step order (the last is the screen at the failing step), so `pruneEvidence` keeps it.
 * `<flow>` is the Maestro flow folder when it is a flow name, else `maestro`; never the file's text.
 */
function renameMaestroScreenshots(dir) {
  const shots = readdirSync(dir, { recursive: true })
    .map(String)
    .filter(
      (entry) =>
        basename(dirname(entry)) === "screenshots" &&
        entry.endsWith(".png") &&
        !EVIDENCE_FILE.test(basename(entry)) &&
        statSync(join(dir, entry), { throwIfNoEntry: false })?.isFile(),
    )
    .sort();
  const counts = new Map();
  for (const entry of shots) {
    const folder = dirname(entry);
    const flow = basename(dirname(folder));
    const n = (counts.get(folder) ?? 0) + 1;
    counts.set(folder, n);
    const name = FLOW_NAME.test(flow) ? flow : "maestro";
    renameSync(
      join(dir, entry),
      join(dir, folder, `kc__${name}__failure-${String(n).padStart(2, "0")}.png`),
    );
  }
}

/** True when a run's evidence holds at least one screenshot (a recording's stills do not count). */
function hasScreenshot(dir) {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .some((entry) => basename(entry).startsWith("kc__") && entry.endsWith(".png"));
}

/** Deletes every downloaded file but the evidence (the API log and the rest of Maestro's output included). */
function pruneEvidence(dir) {
  for (const entry of readdirSync(dir, { recursive: true }).map(String)) {
    const file = join(dir, entry);
    if (
      statSync(file, { throwIfNoEntry: false })?.isFile() &&
      !EVIDENCE_FILE.test(basename(entry))
    ) {
      rmSync(file, { force: true });
    }
  }
}

/**
 * Stills of every recording under `dir`, when ffmpeg is there: the judge cannot watch a video. Each
 * ffmpeg call ends by `deadline`. Returns true or false (stills made or not), or null when the
 * deadline cut it off.
 */
function extractFrames(dir, deadline) {
  const ffmpeg = process.env.KC_FFMPEG || "ffmpeg";
  const left = () => deadline - Date.now();
  if (left() <= 0) {
    return null;
  }
  const probe = spawnSync(ffmpeg, ["-version"], {
    stdio: "ignore",
    timeout: Math.min(left(), 10000),
  });
  if (probe.status !== 0) {
    return timedOut(probe) ? null : false;
  }
  const frames = join(dir, "frames");
  let any = false;
  for (const entry of readdirSync(dir, { recursive: true }).map(String)) {
    if (!entry.endsWith(".mp4")) {
      continue;
    }
    if (left() <= 0) {
      return null;
    }
    mkdirSync(frames, { recursive: true });
    const stem = basename(entry, ".mp4");
    const done = spawnSync(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        join(dir, entry),
        "-vf",
        "fps=1/2",
        "-frames:v",
        "60",
        join(frames, `${stem}-%03d.png`),
      ],
      { stdio: "ignore", timeout: left() },
    );
    if (timedOut(done)) {
      return null;
    }
    any = any || done.status === 0;
  }
  return any;
}

/** Polling stops this many seconds before the deadline, so most slices leave the downloads room. */
const DOWNLOAD_RESERVE = 120;
/** The most a slow poll may run past the deadline: slice 480 s + 60 s + one 5 s read stays under 600 s. */
const POLL_GRACE = 60;

/**
 * Waits for the hosted runs; when all are judged, downloads each run's evidence. One deadline,
 * `--timeout` from the start, bounds everything, the downloads and ffmpeg included (ADR-0058's 10
 * minute cap): what does not fit is exit 3, and the next slice resumes from the runs not yet done
 * (a finished run's evidence is marked by `<id>.done` next to its folder).
 */
async function wait({ runs, sha, timeout = 480 }) {
  const repo = config().github.ownerRepo;
  const started = Date.now();
  const deadline = started + timeout * 1000;
  const outcomes = new Map();
  for (;;) {
    for (const id of runs.filter((r) => !outcomes.has(r))) {
      if (Date.now() > deadline + POLL_GRACE * 1000) {
        finish({
          code: GATE_EXIT.waiting,
          lines: [
            `WAITING: ${runs.length - outcomes.size} of ${runs.length} hosted runs unfinished`,
          ],
        });
      }
      const run = ghJson(["api", `repos/${repo}/actions/runs/${id}`], `run ${id}`, deadline);
      const jobs =
        run.status === "completed"
          ? ghJson(
              ["api", `repos/${repo}/actions/runs/${id}/jobs`],
              `the jobs of run ${id}`,
              deadline,
            )
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
    if (Date.now() + pollMs() > deadline - DOWNLOAD_RESERVE * 1000) {
      finish({
        code: GATE_EXIT.waiting,
        lines: [`WAITING: ${unfinished} of ${runs.length} hosted runs unfinished`],
      });
    }
    await sleep(pollMs());
  }
  const artifact = `device-flows-${sha}`;
  const runsDir = join(workDir(), "scenario-runs");
  const marker = (id) => join(runsDir, `${id}.done`);
  const notYet = () => runs.filter((id) => !existsSync(marker(id))).length;
  const later = () =>
    finish({
      code: GATE_EXIT.waiting,
      lines: [`WAITING: evidence of ${notYet()} of ${runs.length} hosted runs not downloaded yet`],
    });
  for (const id of runs) {
    if (existsSync(marker(id))) {
      continue;
    }
    const evidence = join(runsDir, String(id));
    rmSync(evidence, { recursive: true, force: true });
    mkdirSync(evidence, { recursive: true });
    if (deadline - Date.now() <= 0) {
      later();
    }
    const got = ghCall(
      ["run", "download", String(id), "--repo", repo, "--name", artifact, "--dir", evidence],
      undefined,
      deadline - Date.now(),
    );
    if (timedOut(got)) {
      rmSync(evidence, { recursive: true, force: true });
      later();
    }
    if (got.status !== 0) {
      finish({
        code: GATE_EXIT.closed,
        lines: [
          `ERROR: hosted-run-error: run ${id} has no artifact device-flows-${sha.slice(0, 8)} (${firstLine(got.error?.message ?? got.stderr)})`,
        ],
      });
    }
    renameMaestroScreenshots(evidence);
    pruneEvidence(evidence);
    // A failed run with no screen at all never reached the app (run 38801470319: the Maestro driver
    // did not start). That is the runner's error, not a Collector's failure, so it is never judged.
    if (outcomes.get(id) === "flow-failed" && !hasScreenshot(evidence)) {
      rmSync(evidence, { recursive: true, force: true });
      finish({
        code: GATE_EXIT.closed,
        lines: [
          `ERROR: hosted-run-error: run ${id} failed with no screenshot in its evidence (Maestro or the Simulator did not start)`,
        ],
      });
    }
    const frames = extractFrames(evidence, deadline);
    if (frames === null) {
      rmSync(evidence, { recursive: true, force: true });
      later();
    }
    writeFileSync(marker(id), JSON.stringify({ frames }));
  }
  oneLine(GATE_EXIT.open, {
    verdict: `SCENARIOS wait: ${runs.length} hosted runs finished on ${sha.slice(0, 8)}`,
    runs: runs.map((id) => ({
      run: id,
      outcome: outcomes.get(id),
      evidence: join(runsDir, String(id)),
      frames: JSON.parse(readFileSync(marker(id), "utf8")).frames === true,
    })),
  });
}

/**
 * On the hosted runner, before the upload (KIT-366): the same rename and prune `wait` does, so the
 * artifact `device-flows-<sha>` of an artifact run holds only `kc__*.png|mp4`, never Maestro's
 * flow-bearing output. A missing directory (Maestro never started) keeps nothing and is exit 0.
 */
function evidence({ dir }) {
  if (!existsSync(dir)) {
    oneLine(GATE_EXIT.open, {
      verdict: `SCENARIOS evidence ${dir}: 0 files kept`,
      kept: 0,
      renamed: 0,
    });
  }
  const count = (test) =>
    readdirSync(dir, { recursive: true })
      .map(String)
      .filter((entry) => statSync(join(dir, entry), { throwIfNoEntry: false })?.isFile())
      .filter(test).length;
  const failures = () => count((entry) => /__failure-\d+\.png$/.test(entry));
  const before = failures();
  renameMaestroScreenshots(dir);
  const renamed = failures() - before;
  pruneEvidence(dir);
  const kept = count(() => true);
  oneLine(GATE_EXIT.open, {
    verdict: `SCENARIOS evidence ${dir}: ${kept} file${kept === 1 ? "" : "s"} kept`,
    kept,
    renamed,
  });
}

/**
 * The proof of the token split (KIT-366): the Holdout's artifact list read twice, with the gh login
 * (as every agent thread on this machine reads GitHub) and with SCENARIOS_GH_TOKEN. Open (exit 0)
 * only when the first is denied and the second reads. Prints no artifact name and no repo name.
 */
function access() {
  const repo = config().scenarios.holdoutRepo;
  const probe = (env) => {
    const result = ghCall(
      ["api", `repos/${repo}/actions/artifacts?per_page=1`, "--jq", ".total_count"],
      undefined,
      60000,
      env,
    );
    if (result.status === 0) {
      return "reads";
    }
    if (!result.error && /HTTP 40[134]\b/.test(result.stderr)) {
      return "denied";
    }
    return unknown(
      `cannot probe the Holdout's artifacts: ${firstLine(result.error?.message ?? result.stderr)}`,
    );
  };
  const ambient = probe(process.env);
  const cli = holdoutToken() ? probe(holdoutEnv()) : "unset";
  const open = ambient === "denied" && cli === "reads";
  const why = open
    ? ""
    : cli === "unset"
      ? `: ${HOLDOUT_TOKEN_NAME} is not set (env or the main checkout's .env)`
      : ambient === "reads"
        ? ": the gh login still reads the Holdout"
        : `: ${HOLDOUT_TOKEN_NAME} cannot read the Holdout's artifacts`;
  oneLine(open ? GATE_EXIT.open : GATE_EXIT.closed, {
    verdict: `SCENARIOS access: ambient ${ambient}, cli ${cli}${why}`,
    ambient,
    cli,
  });
}

const MILESTONE_COMMANDS = {
  check,
  score,
  status,
  report,
  flow,
  run: runFlow,
  wait,
  evidence,
  access,
};

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
  unknown(
    error instanceof LinearFailure ? error.message : `scenarios: ${error.message.split("\n")[0]}`,
  );
}
