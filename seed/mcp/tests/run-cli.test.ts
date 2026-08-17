import { describe, expect, it, vi } from "vitest";
import { buildSeedCliInvocation, laneEnvForCli, runSeedCli } from "../src/run-cli.js";
import type { CliRunner } from "../src/run-cli.js";

describe("buildSeedCliInvocation", () => {
  it("wraps the apify CLI with competition, season range, and lane", () => {
    expect(
      buildSeedCliInvocation("apify", {
        competition: "superligaen",
        fromSeason: "0001",
        toSeason: "2025/26",
        lane: "development",
      }),
    ).toEqual({
      command: "pnpm",
      argv: [
        "--filter",
        "@kit-collective/seed-apify",
        "run",
        "seed",
        "--",
        "superligaen",
        "0001",
        "2025/26",
        "development",
      ],
    });
  });

  it("wraps the fkapi CLI", () => {
    const { argv } = buildSeedCliInvocation("fkapi", {
      competition: "championship",
      fromSeason: "2018/19",
      toSeason: "today",
      lane: "staging",
    });
    expect(argv).toContain("@kit-collective/seed-fkapi");
    expect(argv.at(-1)).toBe("staging");
  });
});

describe("laneEnvForCli", () => {
  it("maps development to DATABASE_URL", () => {
    const env = laneEnvForCli("development");
    expect(env.SEED_LANE).toBe("development");
    expect(env.DATABASE_URL).toBe(process.env.DATABASE_URL);
  });

  it("maps staging to SEED_STAGING_DATABASE_URL", () => {
    process.env.SEED_STAGING_DATABASE_URL = "postgresql://staging/example";
    const env = laneEnvForCli("staging");
    expect(env.DATABASE_URL).toBe("postgresql://staging/example");
    delete process.env.SEED_STAGING_DATABASE_URL;
  });
});

describe("runSeedCli", () => {
  it("rejects production before spawning", async () => {
    const runner = vi.fn<CliRunner>();
    const result = await runSeedCli(
      "apify",
      {
        competition: "superligaen",
        fromSeason: "0001",
        toSeason: "today",
        lane: "production",
      },
      runner,
    );
    expect(result.ok).toBe(false);
    expect(runner).not.toHaveBeenCalled();
  });

  it("defaults lane to development when omitted", async () => {
    const runner = vi.fn<CliRunner>().mockResolvedValue({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    });

    await runSeedCli(
      "apify",
      {
        competition: "superligaen",
        fromSeason: "0001",
        toSeason: "today",
      },
      runner,
    );

    expect(runner).toHaveBeenCalledWith(
      "pnpm",
      expect.arrayContaining(["development"]),
      expect.objectContaining({ env: expect.objectContaining({ SEED_LANE: "development" }) }),
    );
  });
});
