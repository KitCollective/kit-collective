/**
 * Invoke seed_apify the same way kc_seed_mcp does: parseSeedMcpInput → pnpm exec node dist/cli.js.
 * Usage: node run-seed-apify-mcp-path.mjs <competition> <fromSeason> <toSeason> [lane]
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runSeedCli } from "../dist/run-cli.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const [competition, fromSeason, toSeason, lane] = process.argv.slice(2);

if (!competition || !fromSeason || !toSeason) {
  console.error(
    "Usage: node run-seed-apify-mcp-path.mjs <competition> <fromSeason> <toSeason> [lane]",
  );
  process.exit(1);
}

const runner = (command, args, options) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      ...options,
      env: { ...process.env, ...options.env },
      cwd: options.cwd,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });

const result = await runSeedCli(
  "apify",
  { competition, fromSeason, toSeason, lane },
  runner,
);

if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

console.log(`seed_apify exited with code ${result.exitCode}`);
if (result.stdout.trim()) {
  console.log("stdout:", result.stdout.trim());
}
if (result.stderr.trim()) {
  console.log("stderr:", result.stderr.trim());
}

process.exit(result.exitCode);
