/**
 * Design review of changed device-flow steps (KIT-267). The reviewer reads a
 * before/after screenshot pair, the Linear issue's contract and the matching
 * part of `docs/design-system.md`. It flags; it never edits UI, and its
 * findings are advisory.
 *
 * The reviewer is a headless Claude Code run (`claude -p`) on the Mac's Claude
 * subscription: no API key, no model provider of its own.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REVIEW_TIMEOUT_MS = 180_000;
const MAX_REASON_LENGTH = 120;
const ASKED_FOR = ["yes", "no", "unclear"];

/**
 * All the review run gets from the runner's environment. Lane secrets, the
 * GitHub token and any API key stay out, so the run can neither leak them nor
 * bill an API account instead of the subscription.
 */
const CHILD_ENV = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "TMPDIR"];

function childEnv(env) {
  return Object.fromEntries(
    CHILD_ENV.filter((name) => env[name] !== undefined).map((name) => [name, env[name]]),
  );
}

/**
 * The parts of a Linear issue body the reviewer judges against: the
 * write-scope line and the "What to build" section.
 * @param {string} description
 */
export function issueContract(description) {
  const scope = /^write-scope:.*$/m.exec(description)?.[0] ?? "write-scope: (not declared)";
  const lines = description.split("\n");
  const start = lines.findIndex((line) => /^##\s+What to build\s*$/i.test(line));
  if (start === -1) {
    return `${scope}\n\n${description.trim()}`;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return `${scope}\n\n## What to build\n\n${body}`;
}

/**
 * What the reviewer judges a change against. A PR that names no issue is judged
 * with nothing asked for. An issue that could not be read (no key, an outage,
 * an empty body) is a different thing: there is no contract, and no step may be
 * called "not asked for" on the strength of it.
 * @param {{ status: "read", description: string } | { status: "none" } | { status: "unread", reason: string }} issue
 * @returns {{ contract: string, unavailable?: undefined } | { unavailable: string, contract?: undefined }}
 */
export function reviewContract(issue) {
  if (issue.status === "read") {
    return { contract: issueContract(issue.description) };
  }
  if (issue.status === "none") {
    return {
      contract: "(this PR names no Linear issue; treat every visible change as not asked for)",
    };
  }
  return { unavailable: `the Linear issue could not be read (${issue.reason})` };
}

/**
 * The named `##`/`###` sections of the design system, in document order.
 * @param {string} markdown
 * @param {string[]} headings
 */
export function designExcerpt(markdown, headings) {
  const wanted = new Set(headings.map((heading) => heading.toLowerCase()));
  const out = [];
  let keeping = false;
  let depth = 0;
  for (const line of markdown.split("\n")) {
    const heading = /^(#{2,3})\s+(.*?)\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (wanted.has(heading[2].toLowerCase())) {
        keeping = true;
        depth = level;
      } else if (keeping && level <= depth) {
        keeping = false;
      }
    }
    if (keeping) {
      out.push(line);
    }
  }
  return out.join("\n").trim();
}

const INSTRUCTIONS = `You review one screen of a mobile app after a code change.
You get the screen before and after (either may be missing), the contract of the issue the change was made for, and the design-system rules for this screen.
The top strip of each screenshot is the iOS status bar; ignore it.
Answer with one JSON object and nothing else:
{
  "whatChanged": "one or two plain sentences on what is visibly different",
  "askedFor": "yes" | "no" | "unclear",
  "designLock": { "breaks": true | false, "rule": "the design-system rule it breaks, quoted or named, or null" },
  "suggestion": "optional improvement, or null"
}
"askedFor" is "yes" only when the issue contract asks for this visible change, and "no" when the contract does not cover this screen or says not to change it.
"designLock.breaks" is true only when you can name the rule from the excerpt.
A suggestion is your opinion, not a rule. Do not propose code.`;

/**
 * The whole request as one prompt. The screenshots are files next to the run
 * (`before.png`, `after.png`), which the reviewer reads itself.
 * @param {{
 *   flow: string, step: string, status: "changed" | "new" | "removed",
 *   contract: string, excerpt: string, hasBefore: boolean, hasAfter: boolean,
 * }} input
 */
export function buildReviewPrompt({ flow, step, status, contract, excerpt, hasBefore, hasAfter }) {
  const image = (name, present) =>
    present
      ? `Read the image file ${name}.png in the current directory: it is the screen ${name} the change.`
      : `There is no "${name}" screenshot for this step.`;
  return [
    INSTRUCTIONS,
    `Flow: ${flow}\nStep: ${step}\nComparison: ${status}`,
    image("before", hasBefore),
    image("after", hasAfter),
    `# Issue contract\n\n${contract}`,
    `# Design system (excerpt)\n\n${excerpt || "(no matching section)"}`,
  ].join("\n\n");
}

/**
 * @typedef {{
 *   whatChanged: string, askedFor: "yes" | "no" | "unclear",
 *   designLock: { breaks: boolean, rule: string | null }, suggestion: string | null,
 * }} Verdict
 */

/**
 * @param {string} text the model's reply
 * @returns {Verdict}
 */
export function parseVerdict(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The reviewer did not answer with JSON");
  }
  const raw = JSON.parse(text.slice(start, end + 1));
  if (typeof raw.whatChanged !== "string" || !raw.whatChanged.trim()) {
    throw new Error("The reviewer's answer has no whatChanged");
  }
  if (!ASKED_FOR.includes(raw.askedFor)) {
    throw new Error("The reviewer's answer has no valid askedFor");
  }
  const breaks = raw.designLock?.breaks === true;
  const rule = typeof raw.designLock?.rule === "string" ? raw.designLock.rule.trim() : "";
  return {
    whatChanged: raw.whatChanged.trim(),
    askedFor: raw.askedFor,
    // A break without a named rule is an opinion, not a design-lock finding.
    designLock: { breaks: breaks && rule !== "", rule: breaks && rule !== "" ? rule : null },
    suggestion:
      typeof raw.suggestion === "string" && raw.suggestion.trim() ? raw.suggestion.trim() : null,
  };
}

/**
 * A changed screen the issue did not ask for is a finding by itself.
 * @param {Verdict} verdict
 */
export function isFinding(verdict) {
  return verdict.askedFor === "no" || verdict.designLock.breaks;
}

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout) => {
      // A failed run still prints its JSON result; without one, the error stands.
      if (error && !stdout) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Why a run died, without its command line: the message of a failed `execFile`
 * carries every argument, and the prompt is one of them.
 */
function runFailure(error) {
  if (error?.killed) {
    return `The Claude review run timed out (${error.signal ?? "killed"})`;
  }
  if (error?.code === "ENOENT") {
    return "The claude CLI is not installed on this machine";
  }
  return `The Claude review run stopped (${error?.code ?? "unknown reason"})`;
}

/**
 * One headless Claude Code run in an empty directory holding only the two
 * screenshots. It gets the Read tool and nothing else: no settings, no MCP
 * servers, no session kept, and a minimal environment. Read is not confined to
 * that directory, and the reply ends up in a public PR comment, so the prompt
 * (issue body, design excerpt) is only ever built from the approver's own
 * branches.
 * @param {{
 *   prompt: string, beforePng: Buffer | null, afterPng: Buffer | null, model: string,
 *   run?: (command: string, args: string[], options: object) => Promise<string>,
 * }} input
 * @returns {Promise<Verdict>}
 */
export async function requestVerdict({ prompt, beforePng, afterPng, model, run = runCommand }) {
  const cwd = mkdtempSync(join(tmpdir(), "kc-device-flow-review-"));
  try {
    if (beforePng) {
      writeFileSync(join(cwd, "before.png"), beforePng);
    }
    if (afterPng) {
      writeFileSync(join(cwd, "after.png"), afterPng);
    }
    const args = ["-p", prompt, "--model", model, "--tools", "Read", "--allowedTools", "Read"];
    args.push("--setting-sources", "", "--strict-mcp-config", "--no-session-persistence");
    args.push("--output-format", "json");
    let stdout;
    try {
      stdout = await run("claude", args, {
        cwd,
        env: childEnv(process.env),
        timeout: REVIEW_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
      });
    } catch (error) {
      throw new Error(runFailure(error));
    }
    const reply = JSON.parse(stdout);
    if (reply.is_error) {
      const reason = String(reply.result ?? "no message").slice(0, MAX_REASON_LENGTH);
      throw new Error(`The Claude review run failed: ${reason}`);
    }
    return parseVerdict(String(reply.result ?? ""));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
