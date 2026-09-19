#!/usr/bin/env node
import { runCli } from "./run.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

try {
  await runCli({ argv: process.argv.slice(2), databaseUrl });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
