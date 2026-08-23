#!/usr/bin/env node
/**
 * Ratchet (KIT-39): fail CI when a PR touches paths outside the Linear issue's
 * declared write-scope (plus ratchet-exception paths from docs/agents/write-scope.md).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  findWriteScopeViolations,
  parseWriteScopeGlobs,
  shouldEnforceWriteScope,
} from "./lib/pr-write-scope.mjs";

function getScopeSourceText() {
  if (process.env.WRITE_SCOPE) {
    return `write-scope: ${process.env.WRITE_SCOPE}`;
  }

  if (process.env.PR_BODY) {
    return [process.env.PR_TITLE, process.env.PR_BODY, process.env.PR_HEAD_REF]
      .filter(Boolean)
      .join("\n");
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath) {
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    if (event.pull_request) {
      const pullRequest = event.pull_request;
      return [pullRequest.title, pullRequest.body, pullRequest.head?.ref]
        .filter(Boolean)
        .join("\n");
    }
  }

  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    const ghEnv = token ? { ...process.env, GH_TOKEN: token } : process.env;
    const json = execFileSync("gh", ["pr", "view", branch, "--json", "title,body,headRefName"], {
      encoding: "utf8",
      env: ghEnv,
    });
    const pullRequest = JSON.parse(json);
    return [pullRequest.title, pullRequest.body, pullRequest.headRefName]
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
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

function main() {
  const scopeText = getScopeSourceText();
  const globs = parseWriteScopeGlobs(scopeText);

  if (!shouldEnforceWriteScope(globs)) {
    console.log(
      "PR write-scope check skipped (no write-scope: declaration — optional per docs/agents/write-scope.md).",
    );
    process.exit(0);
  }

  const baseRef = process.env.BASE_REF ?? "origin/development";
  const changedFiles = getChangedFiles(baseRef);
  const violations = findWriteScopeViolations(changedFiles, globs);

  if (violations.length > 0) {
    console.error("PR write-scope ratchet failed — files outside declared write-scope:\n");
    for (const file of violations) {
      console.error(`  - ${file}`);
    }
    console.error(`\nDeclared write-scope: ${globs.join(", ")}`);
    console.error(
      "Ratchet-exception paths: .cursor/hooks/**, .cursor/rules/**, docs/agents/error-ratcheting.md, .github/workflows/** (CI wiring), and named ratchet scripts listed in scripts/lib/pr-write-scope.mjs",
    );
    process.exit(1);
  }

  console.log(`PR write-scope check passed (${changedFiles.length} changed file(s)).`);
}

main();
