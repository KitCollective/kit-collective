#!/usr/bin/env node
/**
 * CI ratchet (KIT-125): fail when a PR adds packages/db/migrations/NNNN_*.sql
 * whose prefix already exists on origin/development under a different name.
 */
import { execFileSync } from "node:child_process";
import {
  findMigrationPrefixCollisions,
  formatMigrationCollisionFeedback,
  missingBaseMigrations,
  nextMigrationPrefix,
} from "./lib/migration-prefix.mjs";

function gitLines(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function ensureBaseRef(baseRef) {
  if (baseRef !== "origin/development") {
    return;
  }
  try {
    execFileSync("git", ["fetch", "origin", "+development:refs/remotes/origin/development"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    // ls-tree / missingBaseMigrations fail closed when the ref is absent
  }
}

function main() {
  const baseRef = process.env.BASE_REF ?? "origin/development";
  ensureBaseRef(baseRef);
  const added = gitLines([
    "diff",
    "--name-only",
    "--diff-filter=A",
    `${baseRef}..HEAD`,
    "--",
    "packages/db/migrations",
  ]);
  const base = gitLines(["ls-tree", "-r", "--name-only", baseRef, "--", "packages/db/migrations"]);
  if (missingBaseMigrations(added, base)) {
    console.error(
      `check-migration-prefixes: cannot read ${baseRef} migrations while this branch adds SQL. Fetch origin/development.`,
    );
    process.exit(1);
  }
  const collisions = findMigrationPrefixCollisions(added, base);
  if (collisions.length === 0) {
    console.log("check-migration-prefixes: ok");
    return;
  }
  const next = nextMigrationPrefix(base);
  console.error("check-migration-prefixes: colliding Drizzle prefixes:");
  for (const line of formatMigrationCollisionFeedback(collisions, next)) {
    console.error(`  ${line}`);
  }
  process.exit(1);
}

main();
