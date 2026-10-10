#!/usr/bin/env node
/**
 * Review-gate check (ADR-0050): code identifiers and code file names added on this branch
 * are English (.cursor/rules/code-english.mdc). Reuses the commit hook's scanner so the hook,
 * the pre-review gate and CI agree. Added lines only; UI copy and Expo route slugs are not flagged.
 *
 * BASE_REF defaults to origin/development. Diff is merge-base to HEAD.
 */
import { execFileSync } from "node:child_process";
import {
  findDanishCodeIdentifiers,
  findDanishFileNames,
} from "../.cursor/hooks/lib/danish-code-identifiers.mjs";

const baseRef = process.env.BASE_REF ?? "origin/development";
const CODE_PATHSPEC = ["*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs", "*.mts", "*.cts"];

/** @param {string[]} args */
function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

try {
  git(["rev-parse", "--verify", `${baseRef}^{commit}`]);
} catch {
  process.stdout.write(`check-code-english: ${baseRef} not found; nothing to compare.\n`);
  process.exit(0);
}

const range = `${baseRef}...HEAD`;
const identifiers = findDanishCodeIdentifiers(git(["diff", "-U0", range, "--", ...CODE_PATHSPEC]));
const added = git(["diff", "--name-only", "--diff-filter=AR", range]).split("\n").filter(Boolean);
const fileNames = findDanishFileNames(added);

if (identifiers.length === 0 && fileNames.length === 0) {
  process.stdout.write("check-code-english: no Danish identifiers or file names added.\n");
  process.exit(0);
}

for (const hit of identifiers) {
  process.stderr.write(`Danish identifier \`${hit.name}\` (${hit.stem}): ${hit.line}\n`);
}
for (const hit of fileNames) {
  process.stderr.write(`Danish file name ${hit.path} (${hit.stem})\n`);
}
process.stderr.write(
  "Code identifiers and file names are English; UI copy may stay Danish (.cursor/rules/code-english.mdc).\n",
);
process.exit(1);
