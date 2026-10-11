#!/usr/bin/env node
/**
 * Prints the start decision for one issue as one JSON line (ADR-0051).
 *
 * Usage: node scripts/start-decision.mjs [--red-audits n] [--replan] < issue.json
 *        node scripts/start-decision.mjs --issue KIT-n [--red-audits n] [--replan]
 *   issue.json: { "body": "<issue description>", "labels": ["<label>", ...] }
 *   --issue reads the same two fields from Linear through scripts/linear.mjs instead of stdin.
 * Exit: 0 printed, 2 unreadable input.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startDecision } from "./lib/start-decision.mjs";

const args = process.argv.slice(2);
const at = args.indexOf("--red-audits");
const redAudits = at === -1 ? 0 : Number(args[at + 1]);
try {
  const key = args.indexOf("--issue") === -1 ? null : args[args.indexOf("--issue") + 1];
  if (key !== null && !/^[A-Z][A-Z0-9]*-\d+$/.test(key ?? "")) {
    throw new Error("--issue needs a key like KIT-n");
  }
  const issue =
    key === null
      ? JSON.parse(readFileSync(0, "utf8"))
      : (({ description, labels }) => ({ body: description, labels }))(
          JSON.parse(
            execFileSync(
              "node",
              [join(dirname(fileURLToPath(import.meta.url)), "linear.mjs"), "issue", key],
              { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
            ),
          ),
        );
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
