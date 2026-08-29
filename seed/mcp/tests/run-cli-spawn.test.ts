import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import type { CliRunner } from "../src/run-cli.js";
import { buildSeedCliInvocation, runSeedCli } from "../src/run-cli.js";

function createSpawnRunner(): CliRunner {
  return (command, args, options) =>
    new Promise((resolve) => {
      const child = spawn(command, args, {
        ...options,
        env: { ...process.env, ...options.env },
        cwd: options.cwd,
        shell: false,
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("close", (exitCode) => {
        resolve({ exitCode: exitCode ?? 1, stdout, stderr });
      });
    });
}

describe("runSeedCli spawn integration", () => {
  it("rejects production before spawning a real pnpm exec", async () => {
    const runner = createSpawnRunner();
    const result = await runSeedCli(
      "apify",
      {
        competition: "superligaen",
        fromSeason: "2017/18",
        toSeason: "2017/18",
        lane: "production",
      },
      runner,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/production/i);
    }
  });

  it("builds pnpm exec argv without a literal -- for the seed CLI", () => {
    const { argv } = buildSeedCliInvocation("apify", {
      scope: {
        kind: "competition",
        competition: "superligaen",
        fromSeason: "2017/18",
        toSeason: "2017/18",
      },
      lane: "development",
    });

    expect(argv).toEqual([
      "--filter",
      "@kit/seed-apify",
      "exec",
      "node",
      "dist/cli.js",
      "superligaen",
      "2017/18",
      "2017/18",
      "development",
    ]);
    expect(argv).not.toContain("--");
  });

  it("rejects production before spawning seed_fk via pnpm exec", async () => {
    const runner = createSpawnRunner();
    const result = await runSeedCli(
      "fkapi",
      {
        competition: "superligaen",
        fromSeason: "2017/18",
        toSeason: "2017/18",
        lane: "production",
      },
      runner,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/production/i);
    }
  });

  it("builds pnpm exec argv for seed_fk without a literal --", () => {
    const { argv } = buildSeedCliInvocation("fkapi", {
      scope: {
        kind: "competition",
        competition: "superligaen",
        fromSeason: "2017/18",
        toSeason: "2017/18",
      },
      lane: "development",
    });

    expect(argv).toEqual([
      "--filter",
      "@kit/seed-fkapi",
      "exec",
      "node",
      "dist/cli.js",
      "superligaen",
      "2017/18",
      "2017/18",
      "development",
    ]);
    expect(argv).not.toContain("--");
  });

  it("records spawn argv for a mocked successful seed_apify run", async () => {
    const runner = vi.fn<CliRunner>().mockResolvedValue({
      exitCode: 0,
      stdout: '{"ok":true,"summary":{"fetched":0,"skipped":14,"mapped":0,"failures":[]}}',
      stderr: "",
    });

    const result = await runSeedCli(
      "apify",
      {
        competition: "superligaen",
        fromSeason: "2017/18",
        toSeason: "2017/18",
      },
      runner,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.exitCode).toBe(0);
    }
    expect(runner).toHaveBeenCalledWith(
      "pnpm",
      [
        "--filter",
        "@kit/seed-apify",
        "exec",
        "node",
        "dist/cli.js",
        "superligaen",
        "2017/18",
        "2017/18",
        "development",
      ],
      expect.objectContaining({
        cwd: expect.any(String),
        env: expect.objectContaining({ SEED_LANE: "development" }),
      }),
    );
  });
});
