#!/usr/bin/env node
/**
 * Which model the AFK developer Reviewer runs on (ADR-0067, consequence of 2026-10-19).
 *
 * Usage: node scripts/reviewer-route.mjs
 * Prints exactly one line:
 *   REVIEWER glm                 OpenRouter has at least REVIEWER_MIN_CREDIT_USD (default 1) left
 *   REVIEWER claude <reason>     the override file auto-reviewer.claude is in the main checkout's
 *                                .factory folder, no key, too little credit, or the request failed
 * The key is OPENROUTER_MANAGEMENT_KEY, else OPENROUTER_API_KEY, from the environment or the main
 * checkout's gitignored .env (the credits endpoint needs a management key). It is never printed.
 * Exit: 0 either answer.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { envValue, minCredit, OVERRIDE_FILE, reviewerRoute } from "./lib/reviewer-route.mjs";

function mainCheckout() {
  try {
    const common = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return dirname(common);
  } catch {
    return process.cwd();
  }
}

const main = mainCheckout();
const envPath = join(main, ".env");
let dotenv = null;
try {
  dotenv = existsSync(envPath) ? readFileSync(envPath, "utf8") : null;
} catch {
  dotenv = null;
}
const key =
  envValue("OPENROUTER_MANAGEMENT_KEY", process.env, dotenv) ??
  envValue("OPENROUTER_API_KEY", process.env, dotenv);

let line;
try {
  line = await reviewerRoute({
    key,
    override: existsSync(join(main, OVERRIDE_FILE)),
    min: minCredit(process.env.REVIEWER_MIN_CREDIT_USD),
    fetch: (url, init) => fetch(url, init),
  });
} catch (error) {
  line = `REVIEWER claude route-failed: ${error instanceof Error ? error.name : "error"}`;
}
process.stdout.write(`${line}\n`);
process.exit(0);
