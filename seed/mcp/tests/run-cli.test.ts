import { describe, expect, it, vi } from "vitest";
import type { CliRunner } from "../src/run-cli.js";
import {
  buildSeedCliInvocation,
  laneEnvForCli,
  omitCoolifyHostEnv,
  parseSeedMcpInput,
  runSeedCli,
} from "../src/run-cli.js";
import { APIFY_DESCRIPTION, FK_DESCRIPTION } from "../src/server.js";

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

describe("omitCoolifyHostEnv", () => {
  it("strips Coolify host credentials from the Seed CLI env", () => {
    const stripped = omitCoolifyHostEnv({
      DATABASE_URL: "postgresql://dev/example",
      SEED_PROXY_URL: "http://proxy.example:60000",
      COOLIFY_API_URL: "https://coolify.example",
      COOLIFY_API_TOKEN: "not-for-seed",
      COOLIFY_MCP_URL: "https://coolify.example/mcp",
    });
    expect(stripped.DATABASE_URL).toBe("postgresql://dev/example");
    expect(stripped.SEED_PROXY_URL).toBe("http://proxy.example:60000");
    expect(stripped.COOLIFY_API_URL).toBeUndefined();
    expect(stripped.COOLIFY_API_TOKEN).toBeUndefined();
    expect(stripped.COOLIFY_MCP_URL).toBeUndefined();
  });
});

describe("laneEnvForCli", () => {
  it("does not forward Coolify tokens into the spawned CLI env", () => {
    process.env.COOLIFY_API_TOKEN = "not-for-seed";
    const env = laneEnvForCli("development");
    expect(env.COOLIFY_API_TOKEN).toBeUndefined();
    delete process.env.COOLIFY_API_TOKEN;
  });

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

  it("keeps seed_apify and seed_fk as separate CLI invocations", async () => {
    const runner = vi.fn<CliRunner>().mockResolvedValue({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    });

    const scope = {
      competition: "superligaen",
      fromSeason: "2017/18",
      toSeason: "2017/18",
    };

    await runSeedCli("apify", scope, runner);
    await runSeedCli("fkapi", scope, runner);

    expect(runner).toHaveBeenCalledTimes(2);
    const apifyArgv = runner.mock.calls[0]?.[1] ?? [];
    const fkArgv = runner.mock.calls[1]?.[1] ?? [];
    expect(apifyArgv).toContain("@kit/seed-apify");
    expect(fkArgv).toContain("@kit/seed-fkapi");
    expect(apifyArgv).not.toContain("@kit/seed-fkapi");
    expect(fkArgv).not.toContain("@kit/seed-apify");
  });

  it("rejects production for seed_fk before spawning", async () => {
    const runner = vi.fn<CliRunner>();
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
    expect(runner).not.toHaveBeenCalled();
  });
});

describe("Seed MCP tool descriptions", () => {
  it("tells agents not to use Coolify MCP for Seed scope args", () => {
    expect(APIFY_DESCRIPTION).toContain("Coolify MCP is host-only");
    expect(APIFY_DESCRIPTION).toContain("fromSeason");
    expect(FK_DESCRIPTION).toContain("Coolify MCP is host-only");
    expect(FK_DESCRIPTION).toContain("seed_apify");
  });
});
