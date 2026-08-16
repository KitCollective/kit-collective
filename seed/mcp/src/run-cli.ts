import { spawn } from "node:child_process";
import type { PreparedSeedRun } from "./prepare-seed-run.ts";
import { nodeArgsForBin, resolveSeedCliBin } from "./resolve-cli.ts";

export type SeedCliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  bin: string;
};

export function runPreparedSeedCli(
  run: PreparedSeedRun,
): Promise<SeedCliResult> {
  const bin = resolveSeedCliBin(run.cli);
  const args = [...nodeArgsForBin(bin), ...run.argv];

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        bin,
      });
    });
  });
}

export function formatSeedCliResult(
  run: PreparedSeedRun,
  result: SeedCliResult,
): string {
  const lines = [
    `cli: ${run.cli}`,
    `lane: ${run.lane}`,
    `bin: ${result.bin}`,
    `argv: ${run.argv.join(" ")}`,
    `exit: ${result.exitCode}`,
  ];
  if (result.stdout.trim()) {
    lines.push("", "stdout:", result.stdout.trimEnd());
  }
  if (result.stderr.trim()) {
    lines.push("", "stderr:", result.stderr.trimEnd());
  }
  return lines.join("\n");
}
