import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const jobsDir = path.dirname(fileURLToPath(import.meta.url));

function readJob(name: "apify" | "fk"): string {
  return readFileSync(path.join(jobsDir, `${name}.compose.yaml`), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

describe("Coolify seed job definitions", () => {
  it("defines both CLIs as one-shot jobs with resource limits", () => {
    for (const name of ["apify", "fk"] as const) {
      const yaml = readJob(name);
      assert.match(yaml, /restart:\s*["']?no["']?/);
      assert.match(yaml, /mem_limit:\s*1g/);
      assert.match(yaml, /cpus:\s*["']1\.0["']/);
      assert.doesNotMatch(yaml, /ports:/);
      assert.doesNotMatch(yaml, /restart:\s*always/);
      assert.doesNotMatch(yaml, /restart:\s*unless-stopped/);
    }
  });

  it("invokes the same CLI flags as Seed MCP and defaults to development", () => {
    for (const name of ["apify", "fk"] as const) {
      const yaml = readJob(name);
      assert.match(yaml, /--competition/);
      assert.match(yaml, /--from-season/);
      assert.match(yaml, /--to-season/);
      assert.match(yaml, /--lane/);
      assert.match(yaml, /\$\{SEED_LANE:-development\}/);
    }
  });

  it("does not default a job to production", () => {
    for (const name of ["apify", "fk"] as const) {
      const yaml = readJob(name);
      assert.doesNotMatch(yaml, /SEED_LANE:-production/);
      assert.doesNotMatch(yaml, /--lane\n\s+production/);
    }
  });

  it("rejects production before the CLI starts", () => {
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", path.join(jobsDir, "run.ts")],
      {
        env: {
          ...process.env,
          SEED_CLI: "apify",
          SEED_COMPETITION: "Superligaen",
          SEED_FROM_SEASON: "0001",
          SEED_TO_SEASON: "2026",
          SEED_LANE: "production",
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Production is impossible/);
  });
});
