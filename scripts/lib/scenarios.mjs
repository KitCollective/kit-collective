/**
 * Pure decisions behind the scenarios CLI (ADR-0060, ADR-0053): the Holdout path of a milestone, the
 * Scenario file parser and the verdict lines. The CLI gathers the file (a directory or gh) and prints.
 * The format is documented in docs/agents/scenarios.md.
 */
import { GATE_EXIT } from "./gates.mjs";

/** The required `###` sections of a Scenario, in the order the format lists them. */
export const SECTIONS = ["Starting situation", "Actions", "End state"];

export const USAGE =
  'USAGE: node scripts/scenarios.mjs titles|read --project "<name>" --milestone "<name>" [--dir <path>]';

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

/** Parse argv (after the script name). Returns `{ command, project, milestone, dir }` or `{ error }`. */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== "titles" && command !== "read") {
    return { error: USAGE };
  }
  const values = {};
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (
      !["--project", "--milestone", "--dir"].includes(flag) ||
      value === undefined ||
      value.startsWith("--")
    ) {
      return { error: USAGE };
    }
    values[flag.slice(2)] = value;
  }
  const path =
    values.project && values.milestone ? scenarioPath(values.project, values.milestone) : null;
  return path ? { command, path, dir: values.dir } : { error: USAGE };
}
