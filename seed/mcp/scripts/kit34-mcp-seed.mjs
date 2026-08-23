import { spawn } from "node:child_process";
import { runSeedCli } from "../dist/run-cli.js";

function runner(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      ...options,
      env: { ...process.env, ...options.env },
      cwd: options.cwd,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => (stdout += c));
    child.stderr?.on("data", (c) => (stderr += c));
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}

const from = process.argv[2] ?? "2017/18";
const to = process.argv[3] ?? from;
console.log(`seed_apify MCP path: superligaen ${from} → ${to}`);
const result = await runSeedCli(
  "apify",
  { competition: "superligaen", fromSeason: from, toSeason: to },
  runner,
);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok && result.exitCode === 0 ? 0 : result.ok ? result.exitCode : 1);
