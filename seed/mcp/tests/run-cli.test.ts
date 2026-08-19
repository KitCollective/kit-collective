import { describe, expect, it, vi } from "vitest";
import {
  buildSeedCliInvocation,
  laneEnvForCli,
  parseSeedMcpInput,
  runSeedCli,
} from "../src/run-cli.js";
import type { CliRunner } from "../src/run-cli.js";

describe("buildSeedCliInvocation", () => {
  it("wraps the apify CLI with competition, season range, and lane", () => {
    expect(
      buildSeedCliInvocation("apify", {
        scope: {
          kind: "competition",
          competition: "superligaen",
          fromSeason: "0001",
          toSeason: "2025/26",
        },
        lane: "development",
      }),
    ).toEqual({
      command: "pnpm",
      argv: [
        "--filter",
        "@kit/seed-apify",
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

  it("wraps club + season scope for apify", () => {
    expect(
      buildSeedCliInvocation("apify", {
        scope: {
          kind: "club",
          competition: "dk1",
          clubExternalId: "club-190",
          season: "23/24",
        },
        lane: "development",
      }),
    ).toEqual({
      command: "pnpm",
      argv: [
        "--filter",
        "@kit/seed-apify",
        "run",
        "seed",
        "--",
        "club",
        "dk1",
        "club-190",
        "23/24",
        "development",
      ],
    });
  });

  it("wraps the fkapi CLI", () => {
    const { argv } = buildSeedCliInvocation("fkapi", {
      scope: {
        kind: "competition",
        competition: "championship",
        fromSeason: "2018/19",
        toSeason: "today",
      },
      lane: "staging",
    });
    expect(argv).toContain("@kit/seed-fkapi");
    expect(argv.at(-1)).toBe("staging");
  });
});

describe("parseSeedMcpInput", () => {
  it("parses club scope when club and season are provided", () => {
    const result = parseSeedMcpInput({
      competition: "dk1",
      club: "club-190",
      season: "23/24",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed.scope.kind).toBe("club");
    }
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
