#!/usr/bin/env node
/**
 * Prints the start decision for one issue as one JSON line (ADR-0051).
 *
 * Usage: node scripts/start-decision.mjs [--red-audits n] [--replan] < issue.json
 *   issue.json: { "body": "<issue description>", "labels": ["<label>", ...] }
 * Exit: 0 printed, 2 unreadable input.
 */
import { readFileSync } from "node:fs";
import { startDecision } from "./lib/start-decision.mjs";

const args = process.argv.slice(2);
const at = args.indexOf("--red-audits");
const redAudits = at === -1 ? 0 : Number(args[at + 1]);
try {
  const issue = JSON.parse(readFileSync(0, "utf8"));
  const labels = Array.isArray(issue.labels) ? issue.labels.map(String) : [];
  const decision = startDecision({
    body: String(issue.body ?? ""),
    labels,
    redAudits: Number.isInteger(redAudits) ? redAudits : 0,
    replan: args.includes("--replan"),
  });
  process.stdout.write(`${JSON.stringify(decision)}\n`);
} catch (error) {
  process.stderr.write(`start-decision: ${error.message}\n`);
  process.exit(2);
}
