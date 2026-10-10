#!/usr/bin/env node
/**
 * Verify the current head, one suite at a time, from the `checks` table in factory.config.json
 * (ADR-0055). A suite that passed before on the same command and the same content of its paths
 * is reused, not rerun.
 *
 * Usage: node scripts/verify.mjs [--suite id]... [--changed [base]] [--capability name]...
 *          [--no-reuse] [--json]
 *   --suite       run only these suites (repeatable); default all
 *   --changed     only suites whose paths the diff `<base>...HEAD` touches (base defaults to
 *                 origin/<lanes.integration>)
 *   --capability  what this machine can do (repeatable, or VERIFY_CAPABILITIES=a,b). A suite
 *                 whose `needs` are not all present is skipped, and the run is INCOMPLETE:
 *                 never reported green. The Hetzner container has no Postgres, so `postgres`
 *                 suites skip there.
 *   --json        print the report as JSON instead of one line
 * Results are cached per machine in the gitignored `.factory/verify-cache.json` of the main checkout.
 * Exit: 0 OK, 1 a suite failed or timed out, 2 usage or a bad checks table, 3 INCOMPLETE.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mainCheckout } from "./lib/run-log.mjs";
import {
  reuseKey,
  runSuites,
  suitesFor,
  treeListing,
  VERIFY_EXIT,
  validateChecks,
  verdictOf,
} from "./lib/verify.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const all = (flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
const fail = (message) => {
  process.stderr.write(`verify: ${message}\n`);
  process.exit(VERIFY_EXIT.usage);
};

const config = JSON.parse(readFileSync(join(ROOT, "factory.config.json"), "utf8"));
const problems = validateChecks(config.checks);
if (problems.length > 0) fail(problems.join("; "));

let suites = config.checks.suites;
const wanted = all("--suite");
for (const id of wanted) if (!suites.some((s) => s.id === id)) fail(`no suite ${id}`);
if (wanted.length > 0) suites = suites.filter((s) => wanted.includes(s.id));
const changedAt = args.indexOf("--changed");
if (changedAt !== -1) {
  const next = args[changedAt + 1];
  const base = next && !next.startsWith("--") ? next : `origin/${config.lanes.integration}`;
  const files = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  suites = suitesFor(files, suites);
}

const capabilities = [
  ...all("--capability"),
  ...(process.env.VERIFY_CAPABILITIES ?? "").split(",").filter(Boolean),
];
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const cachePath = join(mainCheckout(ROOT), ".factory", "verify-cache.json");
let cache = {};
try {
  cache = JSON.parse(readFileSync(cachePath, "utf8"));
} catch {
  cache = {};
}

const fullListing = execFileSync("git", ["ls-tree", "-r", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const keyOf = (suite) => reuseKey(suite.command, treeListing(fullListing, suite.paths));

/** Runs the command in its own process group so a timeout kills the whole tree. */
function exec(suite, timeoutSeconds) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("bash", ["-c", suite.command], {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let tail = "";
    const keep = (d) => (tail = (tail + d).slice(-2000));
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // already gone
      }
    }, timeoutSeconds * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        status: timedOut ? "timeout" : code === 0 ? "pass" : "fail",
        durationMs: Date.now() - started,
        tail: code === 0 ? undefined : tail,
      });
    });
  });
}

const rows = await runSuites({
  suites,
  defaults: config.checks.defaults,
  capabilities,
  cache,
  noReuse: args.includes("--no-reuse"),
  keyOf,
  exec,
});
mkdirSync(dirname(cachePath), { recursive: true });
writeFileSync(cachePath, JSON.stringify(cache, null, 2));
const result = verdictOf(rows);
process.stdout.write(
  args.includes("--json")
    ? `${JSON.stringify({ head, ...result, suites: rows }, null, 2)}\n`
    : `${result.line}\n`,
);
process.exit(result.code);
