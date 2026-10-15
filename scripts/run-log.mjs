#!/usr/bin/env node
/**
 * Central run log CLI (ADR-0052). Only the orchestrator thread calls `append`.
 *
 * Usage:
 *   node scripts/run-log.mjs <start|spawn|result|gate|audit|reason> --issue KIT-1 [--step lead]
 *     [--thread thr_x] [--provider p] [--model m] [--outcome o] [--tokens-in n|null]
 *     [--tokens-out n|null] [--usage-thread thr_x] [--verdict v] [--round n] [--sha s]
 *     [--rows a,b] [--code c] [--gate g] [--mode m] [--machine host]
 *   node scripts/run-log.mjs <start|spawn|result|reason> --milestone <project-slug>/<milestone-slug> ...
 *     the same for a Milestone scenarios run (KIT-353), which belongs to a milestone, not an issue
 *   node scripts/run-log.mjs usage <thread>   print token usage of a bb thread as JSON
 *   node scripts/run-log.mjs report [--json]   rework share, rounds and tokens, with vs without Lead
 *   node scripts/run-log.mjs path               print the log file path
 *
 * Exit: 0 written or printed, 2 invalid event or usage (nothing is written).
 * `--usage-thread` fills the token fields from `bb thread show <id> --json`; when bb exposes no
 * usage they stay null, and the report counts the issue as "no tokens recorded".
 */
import { execFileSync } from "node:child_process";
import { append, extractUsage, logPath, readEvents } from "./lib/run-log.mjs";
import { buildReport, renderReport } from "./lib/run-report.mjs";

const [command, ...rest] = process.argv.slice(2);

function usageOf(thread) {
  try {
    const out = execFileSync("bb", ["thread", "show", thread, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return extractUsage(JSON.parse(out));
  } catch {
    return { tokensIn: null, tokensOut: null };
  }
}

function parseFlags(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!key?.startsWith("--") || args[i + 1] === undefined) {
      throw new Error(`bad argument ${key ?? ""}`);
    }
    const name = key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[name] = args[i + 1];
  }
  return out;
}

function coerce(flags) {
  const out = { ...flags };
  for (const key of ["tokensIn", "tokensOut"]) {
    if (key in out) {
      out[key] = out[key] === "null" ? null : Number(out[key]);
    }
  }
  if ("round" in out) {
    out.round = Number(out.round);
  }
  if ("rows" in out) {
    out.rows = out.rows === "" ? [] : out.rows.split(",");
  }
  return out;
}

try {
  if (command === "path") {
    process.stdout.write(`${logPath()}\n`);
  } else if (command === "usage" && rest[0]) {
    process.stdout.write(`${JSON.stringify(usageOf(rest[0]))}\n`);
  } else if (command === "report") {
    const report = buildReport(readEvents(logPath()));
    process.stdout.write(
      `${rest.includes("--json") ? JSON.stringify(report, null, 2) : renderReport(report)}\n`,
    );
  } else if (["start", "spawn", "result", "gate", "audit", "reason"].includes(command)) {
    const flags = parseFlags(rest);
    if (flags.usageThread) {
      Object.assign(flags, usageOf(flags.usageThread));
      delete flags.usageThread;
    }
    append({ event: command, ...coerce(flags) }, { path: logPath() });
    process.stdout.write(`logged ${command}\n`);
  } else {
    process.stderr.write(
      "usage: run-log.mjs <start|spawn|result|gate|audit|reason|usage|report|path> ...\n",
    );
    process.exit(2);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(2);
}
