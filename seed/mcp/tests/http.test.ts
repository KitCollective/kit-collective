import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { applySeedMcpHttpAuth, requireSeedMcpTokenForHttp } from "../src/http-auth.js";
import { runSeedGrain, runSeedJoin } from "../src/http-run.js";
import {
  createSeedMcpHttpServer,
  GRAIN_DESCRIPTION,
  JOIN_DESCRIPTION,
  SEED_MCP_HTTP_TOOL_NAMES,
} from "../src/http-server.js";
import type { CliRunner } from "../src/run-cli.js";
import { SEED_MCP_SERVER_NAME, SEED_MCP_TOOL_NAMES } from "../src/server.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("kc_seed_mcp HTTP catalog", () => {
  it("registers as kc_seed_mcp with seed_grain and seed_join only", () => {
    expect(SEED_MCP_SERVER_NAME).toBe("kc_seed_mcp");
    expect(SEED_MCP_HTTP_TOOL_NAMES).toEqual(["seed_grain", "seed_join"]);
    expect(createSeedMcpHttpServer(vi.fn<CliRunner>())).toBeDefined();
  });

  it("stdio debug binary keeps seed_apify and seed_fk and is not the HTTP catalog", () => {
    expect(SEED_MCP_TOOL_NAMES).toEqual(["seed_apify", "seed_fk"]);
    expect(SEED_MCP_HTTP_TOOL_NAMES).not.toEqual(SEED_MCP_TOOL_NAMES);
  });

  it("tool descriptions say Coolify MCP is host-only so ingest chat does not use Coolify control", () => {
    for (const description of [GRAIN_DESCRIPTION, JOIN_DESCRIPTION]) {
      expect(description).toMatch(/Coolify MCP is host-only/i);
      expect(description).toMatch(/Coolify control/i);
    }
  });
});

describe("seed_join dispatch", () => {
  it("runs Join club/national-team/sentence on the grain CLI, not a sibling FK tool", async () => {
    const runner = vi.fn<CliRunner>().mockResolvedValue({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    });

    await runSeedJoin(
      { subcommand: "club", competition: "superligaen", season: "2010/11" },
      runner,
    );
    await runSeedJoin({ subcommand: "national-team", ntRef: "denmark", season: "2010" }, runner);
    await runSeedJoin(
      {
        subcommand: "sentence",
        sentence: "Seed Superliga 2010/11 including every club, squads, and kits into development.",
      },
      runner,
    );

    expect(runner).toHaveBeenCalledTimes(3);
    const clubArgv = runner.mock.calls[0]?.[1] ?? [];
    const ntArgv = runner.mock.calls[1]?.[1] ?? [];
    const sentenceArgv = runner.mock.calls[2]?.[1] ?? [];

    expect(clubArgv).toEqual([
      "--filter",
      "@kit/seed-apify",
      "exec",
      "node",
      "dist/cli.js",
      "join",
      "club",
      "superligaen",
      "2010/11",
      "development",
    ]);
    expect(ntArgv).toEqual([
      "--filter",
      "@kit/seed-apify",
      "exec",
      "node",
      "dist/cli.js",
      "join",
      "national-team",
      "denmark",
      "2010",
      "development",
    ]);
    expect(sentenceArgv).toEqual([
      "--filter",
      "@kit/seed-apify",
      "exec",
      "node",
      "dist/cli.js",
      "join",
      "sentence",
      "Seed Superliga 2010/11 including every club, squads, and kits into development.",
    ]);

    for (const argv of [clubArgv, ntArgv, sentenceArgv]) {
      expect(argv).not.toContain("@kit/seed-fkapi");
      expect(argv).not.toContain("seed_fk");
    }
  });
});

describe("seed_grain dispatch", () => {
  it("wraps grain CLI kinds and defaults lane to development", async () => {
    const runner = vi.fn<CliRunner>().mockResolvedValue({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    });

    await runSeedGrain({ kind: "league", competition: "superligaen" }, runner);
    await runSeedGrain({ kind: "club", competition: "dk1", clubId: "club-190" }, runner);
    await runSeedGrain({ kind: "national-team", ntRef: "denmark" }, runner);

    expect(runner.mock.calls[0]?.[1]).toEqual([
      "--filter",
      "@kit/seed-apify",
      "exec",
      "node",
      "dist/cli.js",
      "grain",
      "league",
      "superligaen",
      "development",
    ]);
    expect(runner.mock.calls[1]?.[1]).toEqual([
      "--filter",
      "@kit/seed-apify",
      "exec",
      "node",
      "dist/cli.js",
      "grain",
      "club",
      "dk1",
      "club-190",
      "development",
    ]);
    expect(runner.mock.calls[2]?.[1]).toEqual([
      "--filter",
      "@kit/seed-apify",
      "exec",
      "node",
      "dist/cli.js",
      "grain",
      "national-team",
      "denmark",
      "development",
    ]);
  });

  it("rejects production before spawning", async () => {
    const runner = vi.fn<CliRunner>();
    const grain = await runSeedGrain(
      { kind: "league", competition: "superligaen", lane: "production" },
      runner,
    );
    const join = await runSeedJoin(
      {
        subcommand: "club",
        competition: "superligaen",
        season: "2010/11",
        lane: "production",
      },
      runner,
    );
    expect(grain.ok).toBe(false);
    expect(join.ok).toBe(false);
    if (!grain.ok) {
      expect(grain.error).toMatch(/production/i);
    }
    expect(runner).not.toHaveBeenCalled();
  });

  it("uses staging only when named", async () => {
    const runner = vi.fn<CliRunner>().mockResolvedValue({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    });
    await runSeedJoin(
      {
        subcommand: "club",
        competition: "superligaen",
        season: "2010/11",
        lane: "staging",
      },
      runner,
    );
    expect(runner.mock.calls[0]?.[1]?.at(-1)).toBe("staging");
  });
});

describe("SEED_MCP_TOKEN HTTP auth", () => {
  it("refuses boot when the token is missing or empty", () => {
    expect(() => requireSeedMcpTokenForHttp({})).toThrow(/SEED_MCP_TOKEN/);
    expect(() => requireSeedMcpTokenForHttp({ SEED_MCP_TOKEN: "" })).toThrow(/SEED_MCP_TOKEN/);
    expect(() => requireSeedMcpTokenForHttp({ SEED_MCP_TOKEN: "   " })).toThrow(/SEED_MCP_TOKEN/);
    expect(requireSeedMcpTokenForHttp({ SEED_MCP_TOKEN: "op-token" })).toBe("op-token");
  });

  it("denies a request without a matching bearer and does not run a grain or Join", async () => {
    const runner = vi.fn<CliRunner>();
    const unauthorized: { status?: number; ended?: string } = {};
    const res = {
      writeHead(status: number) {
        unauthorized.status = status;
      },
      end(body?: string) {
        unauthorized.ended = body;
      },
    };

    const allowed = applySeedMcpHttpAuth({ headers: {} }, res, "op-token");
    expect(allowed).toBe(false);
    expect(unauthorized.status).toBe(401);

    const wrong = applySeedMcpHttpAuth(
      { headers: { authorization: "Bearer other" } },
      res,
      "op-token",
    );
    expect(wrong).toBe(false);
    expect(unauthorized.status).toBe(401);

    if (allowed || wrong) {
      await runSeedJoin(
        { subcommand: "club", competition: "superligaen", season: "2010/11" },
        runner,
      );
    }
    expect(runner).not.toHaveBeenCalled();
  });
});

describe("mcp.json.example HTTP wiring", () => {
  it("registers kc_seed_mcp with HTTP url and Bearer names and no Coolify tokens", () => {
    // SAFETY: mcp.json.example is committed JSON; the checks below reject a missing
    // kc_seed_mcp entry and only read env key names, never secret values.
    const example = JSON.parse(
      readFileSync(join(repoRoot, ".cursor/mcp.json.example"), "utf8"),
    ) as {
      mcpServers: Record<
        string,
        {
          url?: string;
          command?: string;
          headers?: Record<string, string>;
          env?: Record<string, string>;
        }
      >;
    };

    const seedServer = example.mcpServers.kc_seed_mcp;
    expect(seedServer).toBeDefined();
    if (!seedServer) {
      throw new Error("kc_seed_mcp missing from mcp.json.example");
    }
    expect(example.mcpServers.seed).toBeUndefined();
    expect(seedServer.command).toBeUndefined();
    expect(seedServer.url).toMatch(/\$\{env:SEED_MCP_URL\}/);
    expect(seedServer.headers?.Authorization).toMatch(/Bearer \$\{env:SEED_MCP_TOKEN\}/);
    expect(seedServer.env).toBeUndefined();
    expect(JSON.stringify(seedServer)).not.toMatch(/COOLIFY_/);
    expect(example.mcpServers.coolify).toBeDefined();
  });
});

describe(".env.example Seed MCP HTTP names", () => {
  it("documents SEED_MCP_URL, SEED_MCP_TOKEN, and SEED_FK_FETCH=fixture without values", () => {
    const example = readFileSync(join(repoRoot, ".env.example"), "utf8");
    expect(example).toMatch(/^SEED_MCP_URL=$/m);
    expect(example).toMatch(/^SEED_MCP_TOKEN=$/m);
    expect(example).toMatch(/SEED_FK_FETCH=fixture/);
    expect(example).toMatch(
      /FKAPI_BASE_URL is unset|FKAPI_BASE_URL unset|when `FKAPI_BASE_URL` is unset|when FKAPI_BASE_URL is unset/i,
    );
    expect(example).toMatch(/COOLIFY_API_TOKEN is a different secret|not COOLIFY_API_TOKEN/i);
    expect(example).not.toMatch(/^SEED_MCP_TOKEN=.+$/m);
    expect(example).not.toMatch(/^SEED_MCP_URL=.+$/m);
  });
});
