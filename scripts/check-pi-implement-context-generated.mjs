#!/usr/bin/env node
/**
 * CI ratchet: `.pi/generated/implement-context.md` and PI helper wrappers must match
 * Desktop `.cursor` rules, skills, and agents. Fails when sources drift.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { missingImplementContextSources } from "./generate-pi-implement-context.mjs";

const root = join(import.meta.dirname, "..");

const missingSources = missingImplementContextSources();
if (missingSources.length > 0) {
  console.error("check-pi-implement-context-generated: missing required sources:");
  for (const item of missingSources) {
    console.error(`  - ${item}`);
  }
  process.exit(1);
}

const generator = join(root, "scripts/generate-pi-implement-context.mjs");

const result = spawnSync(process.execPath, [generator, "--check"], {
  cwd: root,
  encoding: "utf8",
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("check-pi-implement-context-generated: ok");
