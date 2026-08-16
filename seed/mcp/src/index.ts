#!/usr/bin/env node
import { spawn } from "node:child_process";
import type { CliRunner } from "./run-cli.js";
import { startSeedMcpServer } from "./server.js";

export const defaultCliRunner: CliRunner = (command, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });

async function main(): Promise<void> {
  await startSeedMcpServer(defaultCliRunner);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
