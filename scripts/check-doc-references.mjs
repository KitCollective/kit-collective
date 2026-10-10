#!/usr/bin/env node
/**
 * Review-gate check (ADR-0050): the docs name what the code now is.
 *
 * 1. A name this branch removed or renamed (declaration, property, Device-flow step) that no
 *    code file still has must not be named in a living doc.
 * 2. A repo path in backticks on a line this branch added to a doc must exist.
 *
 * Living docs exclude ADRs, .scratch specs and archived notes: they record history.
 * BASE_REF defaults to origin/development. Diff is merge-base to HEAD.
 */
import { execFileSync } from "node:child_process";
import {
  addedMarkdownLines,
  backtickedPaths,
  isLivingDoc,
  pathExists,
  removedNames,
} from "./lib/doc-references.mjs";

const baseRef = process.env.BASE_REF ?? "origin/development";

/** @param {string[]} args */
function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

try {
  git(["rev-parse", "--verify", `${baseRef}^{commit}`]);
} catch {
  process.stdout.write(`check-doc-references: ${baseRef} not found; nothing to compare.\n`);
  process.exit(0);
}

const diff = git(["diff", "-U0", `${baseRef}...HEAD`]);
const tracked = git(["ls-files"]).split("\n").filter(Boolean);
const livingDocs = tracked.filter(isLivingDoc);
const codeFiles = tracked.filter((file) =>
  /\.(?:tsx?|jsx?|mjs|cjs|mts|cts|ya?ml|json)$/.test(file),
);
/** @type {string[]} */
const findings = [];

/** @param {string} name @param {string[]} files */
function mentionedIn(name, files) {
  if (files.length === 0) {
    return [];
  }
  try {
    return git(["grep", "-n", "-w", "-F", "-e", name, "--", ...files])
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

for (const name of removedNames(diff)) {
  if (mentionedIn(name, codeFiles).length > 0) {
    continue;
  }
  for (const hit of mentionedIn(name, livingDocs)) {
    findings.push(
      `${hit.split(":").slice(0, 2).join(":")}: names \`${name}\`, which this branch removed`,
    );
  }
}

for (const { file, text } of addedMarkdownLines(diff)) {
  if (!isLivingDoc(file)) {
    continue;
  }
  for (const path of new Set(backtickedPaths(text))) {
    if (!pathExists(path, tracked)) {
      findings.push(`${file}: names path \`${path}\`, which is not in the repository`);
    }
  }
}

if (findings.length === 0) {
  process.stdout.write("check-doc-references: docs match the diff.\n");
  process.exit(0);
}
for (const finding of findings) {
  process.stderr.write(`${finding}\n`);
}
process.stderr.write(
  "Fix the doc or the name; do not leave a living doc describing what is gone.\n",
);
process.exit(1);
