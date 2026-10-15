/**
 * Pure decisions behind the scenarios CLI (ADR-0060, ADR-0053): the Holdout path of a milestone, the
 * Scenario file parser and the verdict lines. The CLI gathers the file (a directory or gh) and prints.
 * The format is documented in docs/agents/scenarios.md.
 */
import { GATE_EXIT } from "./gates.mjs";

/** The required `###` sections of a Scenario, in the order the format lists them. */
export const SECTIONS = ["Starting situation", "Actions", "End state"];

export const USAGE =
  'USAGE: node scripts/scenarios.mjs titles|read|put --project "<name>" --milestone "<name>" [--dir <path>] (put also needs --file <draft>); or titles --issue <KEY> [--dir <path>]; or check|score|status|flow|run|wait (Milestone scenarios, docs/agents/scenarios.md)';

/** What each Milestone scenarios subcommand takes (KIT-353). `--dry-run` is the one flag without a value. */
export const MILESTONE_USAGE = {
  check: 'check --project "<name>" --milestone "<name>" --pr <n> [--dir <path>]',
  score: "score --scenarios <n> --verdicts <i>:<s|n>:<run>,...",
  status:
    "status --sha <40 hex> (--state pending | --state error [--code <code>] [--run <id>] | --scenarios <n> --verdicts <list>) [--dry-run]",
  flow: "flow --name <name> [--timeout <s>]",
  run: "run --flow-run <id> --name <name>",
  wait: "wait --runs <id>,<id>,... --sha <40 hex> [--timeout <s>]",
};

/** A Linear issue key, the only value `titles --issue` accepts. */
export const ISSUE_KEY = /^[A-Z][A-Z0-9]*-\d+$/;

/** A Linear name as a path part: lowercased, runs of non-alphanumerics to one dash, no edge dashes. */
export const slug = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** `<project-slug>/<milestone-slug>.md`, or null when either name has no letter or digit. */
export function scenarioPath(project, milestone) {
  const [projectSlug, milestoneSlug] = [slug(project), slug(milestone)];
  return projectSlug && milestoneSlug ? `${projectSlug}/${milestoneSlug}.md` : null;
}

/**
 * Parse one milestone file. Text before the first `## ` heading is ignored. Each `## <title>` opens a
 * Scenario with exactly the three `### ` sections, each non-empty.
 * @param {string} text
 * @returns {{ scenarios: { title: string, text: string }[] } | { problems: string[] }}
 */
export function parseScenarios(text) {
  const blocks = [];
  for (const line of String(text).replace(/\r\n?/g, "\n").split("\n")) {
    if (/^## /.test(line) || line === "##") {
      blocks.push({ title: line.slice(2).trim(), lines: [] });
    } else {
      blocks.at(-1)?.lines.push(line);
    }
  }
  if (blocks.length === 0) {
    return { problems: ['no "## <title>" Scenario in the file'] };
  }

  const problems = [];
  const titles = new Set();
  const scenarios = blocks.map((block, index) => {
    const label = block.title ? `"${block.title}"` : `Scenario ${index + 1}`;
    if (!block.title) {
      problems.push(`Scenario ${index + 1}: empty title`);
    } else if (titles.has(block.title.toLowerCase())) {
      problems.push(`duplicate title "${block.title}"`);
    }
    titles.add(block.title.toLowerCase());

    const bodies = new Map();
    let current = null;
    for (const line of block.lines) {
      const heading = /^### (.*)$/.exec(line);
      if (heading) {
        current = heading[1].trim();
        if (!SECTIONS.includes(current)) {
          problems.push(`${label}: unknown section "### ${current}"`);
          current = null;
        } else if (bodies.has(current)) {
          problems.push(`${label}: repeated "### ${current}"`);
          current = null;
        } else {
          bodies.set(current, []);
        }
      } else if (current) {
        bodies.get(current).push(line);
      }
    }
    for (const section of SECTIONS) {
      if (!bodies.has(section)) {
        problems.push(`${label}: missing "### ${section}"`);
      } else if (bodies.get(section).join("").trim() === "") {
        problems.push(`${label}: empty "### ${section}"`);
      }
    }
    return { title: block.title, text: [`## ${block.title}`, ...block.lines].join("\n").trimEnd() };
  });

  return problems.length > 0 ? { problems } : { scenarios };
}

const plural = (n) => `${n} Scenario${n === 1 ? "" : "s"}`;

/** What the CLI prints and exits with for a parsed (or absent) milestone file. */
export function renderResult({ command, path, text }) {
  const verdict = (code, line) => ({ code, lines: [line] });
  if (text === null) {
    return verdict(GATE_EXIT.open, `SCENARIOS ${command} ${path}: no Scenarios (no Holdout file)`);
  }
  const parsed = parseScenarios(text);
  if (parsed.problems) {
    const [first, ...rest] = parsed.problems;
    const more = rest.length > 0 ? ` (+${rest.length} more)` : "";
    return verdict(GATE_EXIT.usage, `MALFORMED: ${path}: ${first}${more}`);
  }
  const body =
    command === "titles"
      ? parsed.scenarios.map((s) => s.title)
      : parsed.scenarios.flatMap((s) => [s.text, ""]);
  return {
    code: GATE_EXIT.open,
    lines: [...body, `SCENARIOS ${command} ${path}: ${plural(parsed.scenarios.length)}`],
  };
}

/**
 * What `titles --issue` prints for the issue's milestone: ONE line of JSON, so a command runner that
 * relays only the last line carries the whole answer. `path` is null when the issue has no project
 * or milestone. Never any Scenario text but the titles. A malformed file is the same MALFORMED line
 * as without `--issue` (not JSON); the caller reads the exit code first.
 * @param {{ path: string | null, text: string | null }} input
 */
export function renderIssueTitles({ path, text }) {
  const answer = (verdict, titles) => ({
    code: GATE_EXIT.open,
    lines: [JSON.stringify({ verdict, path, titles })],
  });
  if (path === null) {
    return answer("SCENARIOS titles: no Scenarios (the issue has no project or milestone)", []);
  }
  if (text === null) {
    return answer(`SCENARIOS titles ${path}: no Scenarios (no Holdout file)`, []);
  }
  const parsed = parseScenarios(text);
  if (parsed.problems) {
    return renderResult({ command: "titles", path, text });
  }
  return answer(
    `SCENARIOS titles ${path}: ${plural(parsed.scenarios.length)}`,
    parsed.scenarios.map((s) => s.title),
  );
}

/** The one verdict line of a `put` that wrote `n` Scenarios to `path`. */
export const putVerdict = (path, n) => ({
  code: GATE_EXIT.open,
  lines: [`SCENARIOS put ${path}: ${plural(n)}`],
});

/** What `put` does with a draft: the Scenario count to write, or the verdict that refuses it. */
export function checkDraft({ path, text }) {
  const parsed = parseScenarios(text);
  if (parsed.problems) {
    const [first, ...rest] = parsed.problems;
    const more = rest.length > 0 ? ` (+${rest.length} more)` : "";
    return { verdict: { code: GATE_EXIT.usage, lines: [`MALFORMED: ${path}: ${first}${more}`] } };
  }
  return { count: parsed.scenarios.length };
}

/** The verdict of a `put` onto a milestone that already has a Holdout file. */
export const refusedVerdict = (path) => ({
  code: GATE_EXIT.usage,
  lines: [`REFUSED: ${path} already exists in the Holdout; put only creates a milestone's file`],
});

/**
 * Parse argv (after the script name). Returns `{ command, path, issue, dir, file }` or `{ error }`.
 * `--file` is required for `put` and refused for `titles` and `read`. `--issue <KEY>` is for `titles`
 * alone and replaces `--project` and `--milestone` (the CLI resolves them from Linear); `path` is then
 * null until it has.
 */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command in MILESTONE_USAGE) {
    return parseMilestoneArgs(command, rest);
  }
  if (!["titles", "read", "put"].includes(command)) {
    return { error: USAGE };
  }
  const values = {};
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (
      !["--project", "--milestone", "--dir", "--file", "--issue"].includes(flag) ||
      value === undefined ||
      value.startsWith("--") ||
      flag.slice(2) in values
    ) {
      return { error: USAGE };
    }
    values[flag.slice(2)] = value;
  }
  if (values.issue !== undefined) {
    const alone = command === "titles" && !values.project && !values.milestone && !values.file;
    return alone && ISSUE_KEY.test(values.issue)
      ? { command, path: null, issue: values.issue, dir: values.dir }
      : { error: USAGE };
  }
  const path =
    values.project && values.milestone ? scenarioPath(values.project, values.milestone) : null;
  if (!path || (command === "put") !== Boolean(values.file)) {
    return { error: USAGE };
  }
  return { command, path, dir: values.dir, file: values.file };
}

// ---- Milestone scenarios (KIT-353): check, score, status, flow, run, wait ------------------------
// Every value these subcommands take is a token checked here (a run id, a sha, a fixed code, a
// verdict list of tokens), so a workflow can build their commands without agent text (ADR-0058).

/** The commit status the Milestone scenarios workflow sets on the promotion PR's head (ADR-0060). */
export const STATUS_CONTEXT = "Scenarios";

/** A flow name as `scenario-flow.yml` accepts it; the artifact is `scenario-flow-<name>`. */
export const FLOW_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const RUN_ID = /^[1-9][0-9]{0,19}$/;
export const FULL_SHA = /^[0-9a-f]{40}$/;
/** Largest flow `flow` dispatches: a workflow_dispatch input holds at most 65,535 characters. */
export const MAX_FLOW_CHARS = 60000;
/** The step of device-flows.yml whose conclusion says whether the flow ran (ADR-0059). */
export const FLOWS_STEP = "Run the flows";

/** The `status --state error --code` codes, each with the fixed description it posts. */
export const ERROR_CODES = {
  stopped: "Milestone scenarios stopped before a verdict; run it again",
  "hosted-run-error": "A hosted run stopped before its flow finished; see the run",
  "development-moved": "development moved during the run; run Milestone scenarios again",
  "flow-not-written": "The Scenario judge could not write a flow for a Scenario",
  "producer-failed": "A flow could not be turned into a run artifact",
  "dispatch-failed": "A hosted run could not be started",
  "judge-no-result": "The Scenario judge gave no usable verdict for a run",
  "runner-no-result": "The workflow lost a command result; run it again",
  "wait-exhausted": "The hosted runs did not finish in time; run it again",
  "bad-answer": "A scenarios CLI answer failed its check; run it again",
};
export const PENDING_DESCRIPTION = "The Scenario judge is running the milestone's Scenarios";

const VALUE_FLAGS = {
  check: ["--project", "--milestone", "--pr", "--dir"],
  score: ["--scenarios", "--verdicts"],
  status: ["--sha", "--state", "--code", "--run", "--scenarios", "--verdicts"],
  flow: ["--name", "--timeout"],
  run: ["--flow-run", "--name"],
  wait: ["--runs", "--sha", "--timeout"],
};

const camel = (flag) => flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** Argv of one Milestone scenarios subcommand: `{ command, ...values }` or `{ error }`. */
function parseMilestoneArgs(command, rest) {
  const usage = { error: `USAGE: node scripts/scenarios.mjs ${MILESTONE_USAGE[command]}` };
  const values = {};
  for (let i = 0; i < rest.length; ) {
    const flag = rest[i];
    if (flag === "--dry-run" && command === "status" && !values.dryRun) {
      values.dryRun = true;
      i += 1;
      continue;
    }
    const value = rest[i + 1];
    if (
      !VALUE_FLAGS[command].includes(flag) ||
      value === undefined ||
      value.startsWith("--") ||
      camel(flag) in values
    ) {
      return usage;
    }
    values[camel(flag)] = value;
    i += 2;
  }
  const timeout = values.timeout === undefined ? undefined : Number(values.timeout);
  if (timeout !== undefined && !(Number.isInteger(timeout) && timeout >= 0 && timeout <= 3600)) {
    return usage;
  }
  const ok = (extra) => ({
    command,
    ...values,
    ...(timeout === undefined ? {} : { timeout }),
    ...extra,
  });
  switch (command) {
    case "check": {
      const path =
        values.project && values.milestone ? scenarioPath(values.project, values.milestone) : null;
      return path && /^[1-9][0-9]{0,9}$/.test(values.pr ?? "")
        ? ok({ path, pr: Number(values.pr) })
        : usage;
    }
    case "score":
      return values.scenarios !== undefined && values.verdicts !== undefined ? ok() : usage;
    case "status": {
      if (!FULL_SHA.test(values.sha ?? "")) return usage;
      if (values.run !== undefined && !RUN_ID.test(values.run)) return usage;
      const byVerdicts = values.verdicts !== undefined || values.scenarios !== undefined;
      if (byVerdicts) {
        return values.state === undefined &&
          values.code === undefined &&
          values.run === undefined &&
          values.verdicts !== undefined &&
          values.scenarios !== undefined
          ? ok()
          : usage;
      }
      if (values.state === "pending") {
        return values.code === undefined && values.run === undefined ? ok() : usage;
      }
      if (values.state === "error") {
        return values.code === undefined || values.code in ERROR_CODES
          ? ok({ code: values.code ?? "stopped" })
          : usage;
      }
      return usage;
    }
    case "flow":
      return FLOW_NAME.test(values.name ?? "") ? ok() : usage;
    case "run":
      return FLOW_NAME.test(values.name ?? "") && RUN_ID.test(values.flowRun ?? "") ? ok() : usage;
    case "wait": {
      const runs = String(values.runs ?? "").split(",");
      const valid =
        values.runs &&
        runs.every((r) => RUN_ID.test(r)) &&
        new Set(runs).size === runs.length &&
        runs.length <= 100;
      return valid && FULL_SHA.test(values.sha ?? "") ? ok({ runs: runs.map(Number) }) : usage;
    }
    default:
      return usage;
  }
}

/**
 * The verdict list `<scenario index>:<s|n>:<run id>`, comma-joined, checked against the thresholds:
 * every Scenario 1..scenarios has exactly `runsPerScenario` entries and no run appears twice.
 * @returns {{ entries: { index: number, satisfied: boolean, run: number }[] } | { problem: string }}
 */
export function parseVerdicts(list, { scenarios, runsPerScenario }) {
  const n = Number(scenarios);
  if (!(Number.isInteger(n) && n >= 1 && n <= 50) || !/^[1-9][0-9]?$/.test(String(scenarios))) {
    return { problem: "--scenarios must be a number from 1 to 50" };
  }
  const entries = [];
  for (const token of String(list).split(",")) {
    const match = /^([1-9][0-9]?):([sn]):([1-9][0-9]{0,19})$/.exec(token);
    if (!match) {
      return { problem: "every verdict is <scenario index>:<s|n>:<run id>" };
    }
    entries.push({ index: Number(match[1]), satisfied: match[2] === "s", run: Number(match[3]) });
  }
  if (new Set(entries.map((e) => e.run)).size !== entries.length) {
    return { problem: "a run id appears twice" };
  }
  for (let index = 1; index <= n; index += 1) {
    const count = entries.filter((e) => e.index === index).length;
    if (count !== runsPerScenario) {
      return { problem: `Scenario ${index} has ${count} verdicts, not ${runsPerScenario}` };
    }
  }
  if (entries.some((e) => e.index > n)) {
    return { problem: `a verdict names a Scenario above ${n}` };
  }
  return { entries };
}

/**
 * The milestone's score: a Scenario is met at `satisfiedToMeet` satisfied runs or more, the milestone
 * passes only when every Scenario is met, and Satisfaction is satisfied runs over all runs. `run` is
 * the link: the first run that did not satisfy its Scenario, else the first run.
 */
export function scoreVerdicts(entries, { scenarios, satisfiedToMeet }) {
  const perScenario = [];
  for (let index = 1; index <= scenarios; index += 1) {
    const mine = entries.filter((e) => e.index === index);
    const satisfied = mine.filter((e) => e.satisfied).length;
    perScenario.push({ index, met: satisfied >= satisfiedToMeet, satisfied, runs: mine.length });
  }
  const satisfied = entries.filter((e) => e.satisfied).length;
  const met = perScenario.filter((s) => s.met).length;
  const passed = met === perScenario.length;
  const satisfaction = `${satisfied}/${entries.length} (${Math.round((satisfied / entries.length) * 100)}%)`;
  const link = (entries.find((e) => !e.satisfied) ?? entries[0]).run;
  const description = passed
    ? `Every Scenario met (${met}/${perScenario.length}). Satisfaction ${satisfaction}`
    : `${met} of ${perScenario.length} Scenarios met. Satisfaction ${satisfaction}`;
  return {
    verdict: `SCENARIOS score: ${passed ? "met" : "not met"}, ${met} of ${perScenario.length} Scenarios met, Satisfaction ${satisfaction}`,
    passed,
    state: passed ? "success" : "failure",
    satisfaction,
    scenarios: perScenario,
    run: link,
    description,
  };
}

/** The commit status body. `target_url` is built from a run id and the repo only, never from text. */
export function statusPayload({ state, description, run, ownerRepo }) {
  return {
    state,
    context: STATUS_CONTEXT,
    description,
    ...(run ? { target_url: `https://github.com/${ownerRepo}/actions/runs/${run}` } : {}),
  };
}

/** Why `check` refuses the milestone's issues, or null. At most three keys are named. */
export function refuseMilestoneIssues(issues, { project, milestone }) {
  if (issues.length === 0) {
    return `REFUSED: the milestone ${milestone} of ${project} has no issues`;
  }
  const open = issues.filter((i) => !["Done", "Canceled"].includes(i.state));
  if (open.length === 0) {
    return null;
  }
  const named = open
    .slice(0, 3)
    .map((i) => `${i.identifier} (${i.state})`)
    .join(", ");
  const more = open.length > 3 ? ` (+${open.length - 3} more)` : "";
  return `REFUSED: ${open.length} issue${open.length === 1 ? " of the milestone is" : "s of the milestone are"} not Done or Canceled: ${named}${more}`;
}

/** Why `check` refuses the PR, or null: it must be open and go integration → staging. */
export function refusePromotionPr(pr, number, { integration, staging }) {
  if (pr.state !== "OPEN") {
    return `REFUSED: PR #${number} is not open (${pr.state})`;
  }
  if (pr.headRefName !== integration || pr.baseRefName !== staging) {
    return `REFUSED: PR #${number} is ${pr.headRefName} → ${pr.baseRefName}, not ${integration} → ${staging}`;
  }
  return null;
}

/**
 * What one device-flows run means for the judge. A run is judged only when its flows step
 * concluded success or failure on the checked sha; anything else is an error, never a verdict.
 * @returns {{ outcome: "waiting" | "flow-passed" | "flow-failed" } | { error: string, line: string }}
 */
export function runOutcome({ id, run, jobs, sha }) {
  if (run.head_sha && run.head_sha !== sha) {
    return {
      error: "development-moved",
      line: `run ${id} ran ${String(run.head_sha).slice(0, 8)}, not ${sha.slice(0, 8)}`,
    };
  }
  if (run.status !== "completed") {
    return { outcome: "waiting" };
  }
  const step = (jobs?.jobs ?? []).flatMap((j) => j.steps ?? []).find((s) => s.name === FLOWS_STEP);
  const stepConclusion = step?.conclusion ?? "missing";
  if (run.conclusion === "success" && stepConclusion === "success") {
    return { outcome: "flow-passed" };
  }
  if (run.conclusion === "failure" && stepConclusion === "failure") {
    return { outcome: "flow-failed" };
  }
  return {
    error: "hosted-run-error",
    line: `run ${id} concluded ${run.conclusion}, its flows step ${stepConclusion}`,
  };
}
