#!/usr/bin/env node
import { defaultCliRunner } from "./run-cli.js";
import { startSeedMcpServer } from "./server.js";

async function main(): Promise<void> {
  await startSeedMcpServer(defaultCliRunner);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
