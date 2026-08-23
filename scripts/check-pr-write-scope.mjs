#!/usr/bin/env node
/**
 * Ratchet (KIT-39): fail CI when a PR touches paths outside the Linear issue's
 * declared write-scope (plus ratchet-exception paths from docs/agents/write-scope.md).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const RATCHET_EXCEPTION_PREFIXES = [
  ".cursor/hooks/",
  ".cursor/hooks.json",
  ".cursor/rules/",
  "docs/agents/error-ratcheting.md",
  "scripts/check-",
];

function matchesGlob(filePath, glob) {
  const regexSource = `^${glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*")}$`;
  return new RegExp(regexSource).test(filePath);
}

function isRatchetException(filePath) {
  return RATCHET_EXCEPTION_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function getScopeSourceText() {
  if (process.env.PR_BODY) {
    return process.env.PR_BODY;
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && process.env.GITHUB_EVENT_NAME === "pull_request") {
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    const pullRequest = event.pull_request;
    if (pullRequest) {
      return [pullRequest.title, pullRequest.body, pullRequest.head?.ref]
        .filter(Boolean)
        .join("\n");
    }
  }

  try {
    const json = execFileSync("gh", ["pr", "view", "--json", "title,body,headRefName"], {
      encoding: "utf8",
    });
    const pullRequest = JSON.parse(json);
    return [pullRequest.title, pullRequest.body, pullRequest.headRefName]
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}

function parseWriteScopeGlobs(text) {
  const match = text.match(/^write-scope:\s*(.+)$/m);
  if (!match) {
    return null;
  }
  return match[1]
    .split(",")
    .map((glob) => glob.trim())
    .filter(Boolean);
}

function getChangedFiles(baseRef) {
  try {
    return execFileSync("git", ["diff", "--name-only", `${baseRef}...HEAD`], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return execFileSync("git", ["diff", "--name-only", "HEAD~1"], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
  }
}

const globs = process.env.WRITE_SCOPE
  ? process.env.WRITE_SCOPE.split(",")
      .map((glob) => glob.trim())
      .filter(Boolean)
  : parseWriteScopeGlobs(getScopeSourceText());

if (!globs || globs.length === 0) {
  console.log("PR write-scope check skipped (no write-scope: line on issue/PR).");
  process.exit(0);
}

const baseRef = process.env.BASE_REF ?? "origin/development";
const changedFiles = getChangedFiles(baseRef);
const violations = [];

for (const file of changedFiles) {
  if (isRatchetException(file)) {
    continue;
  }
  const inScope = globs.some((glob) => matchesGlob(file, glob));
  if (!inScope) {
    violations.push(file);
  }
}

if (violations.length > 0) {
  console.error("PR write-scope ratchet failed — files outside declared write-scope:\n");
  for (const file of violations) {
    console.error(`  - ${file}`);
  }
  console.error(`\nDeclared write-scope: ${globs.join(", ")}`);
  console.error(
    "Ratchet-exception paths: .cursor/hooks/**, .cursor/rules/**, docs/agents/error-ratcheting.md, scripts/check-*",
  );
  process.exit(1);
}

console.log(`PR write-scope check passed (${changedFiles.length} changed file(s)).`);
