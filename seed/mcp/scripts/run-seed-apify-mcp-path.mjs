/**
 * Invoke seed_apify the same way kc_seed_mcp does: parseSeedMcpInput → pnpm exec node dist/cli.js.
 * Usage: node run-seed-apify-mcp-path.mjs <competition> <fromSeason> <toSeason> [lane]
 */
import { spawn } from "node:child_process";
import { runSeedCli } from "../dist/run-cli.js";

const [competition, fromSeason, toSeason, lane] = process.argv.slice(2);

if (!competition || !fromSeason || !toSeason) {
  process.stderr.write(
    "Usage: node run-seed-apify-mcp-path.mjs <competition> <fromSeason> <toSeason> [lane]\n",
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

const result = await runSeedCli("apify", { competition, fromSeason, toSeason, lane }, runner);

if (!result.ok) {
  process.stderr.write(`${result.error}\n`);
  process.exit(1);
}

process.stdout.write(`seed_apify exited with code ${result.exitCode}\n`);
if (result.stdout.trim()) {
  process.stdout.write(`stdout: ${result.stdout.trim()}\n`);
}
if (result.stderr.trim()) {
  process.stdout.write(`stderr: ${result.stderr.trim()}\n`);
}

process.exit(result.exitCode);
