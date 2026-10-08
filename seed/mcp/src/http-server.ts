import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runSeedGrain, runSeedJoin, SEED_GRAIN_KINDS } from "./http-run.js";
import type { CliRunner } from "./run-cli.js";
import { SEED_MCP_SERVER_NAME } from "./server.js";

export const SEED_MCP_HTTP_TOOL_NAMES = ["seed_grain", "seed_join"] as const;

export const COOLIFY_HOST_ONLY =
  "Coolify MCP is host-only (servers, databases, long one-shot jobs). Ingest chat must not use Coolify control for a Seed scope. Call this Seed MCP tool instead.";

export const GRAIN_DESCRIPTION = [
  "Run one Hierarchy grain via the seed-apify grain CLI (fetch → normalize → map).",
  "",
  COOLIFY_HOST_ONLY,
  "",
  "Kinds: league, league-season, club, club-season, club-proof, national-team, national-team-season, national-team-proof.",
  "Club kinds never write a NationalTeam row. National-team kinds never stuff kits onto kit.club_id.",
  "Fetch steps (resolve club, profile hop) are not tools.",
  "",
  "Lane: omit for development; staging only when named; production is rejected.",
].join("\n");

export const JOIN_DESCRIPTION = [
  "Run the Join workflow (club, national-team, or sentence). FK after facts runs inside this tool — there is no sibling seed_fk chat tool.",
  "",
  COOLIFY_HOST_ONLY,
  "",
  "club: competition + season (e.g. Superliga 2010/11).",
  "national-team: ntRef + season (e.g. Denmark men World Cup 2010).",
  "sentence: ADR-0014 natural language already parsed by the Join CLI.",
  "",
  "When FKAPI_BASE_URL is unset, the Seed MCP service must set SEED_FK_FETCH=fixture (not a silent default).",
  "Lane: omit for development; staging only when named; production is rejected.",
].join("\n");

const laneSchema = z
  .string()
  .optional()
  .describe(
    "Target database lane. Omit for development. Use staging only when the human explicitly names staging. Production is rejected.",
  );

function toolResult(
  label: string,
  result: Awaited<ReturnType<typeof runSeedGrain>>,
  lane: string | undefined,
) {
  if (!result.ok) {
    return {
      content: [{ type: "text" as const, text: result.error }],
      isError: true,
    };
  }
  const summary = [
    `${label} exited with code ${result.exitCode}`,
    `lane: ${lane?.trim().toLowerCase() || "development"}`,
    result.stdout.trim() ? `\nstdout:\n${result.stdout.trim()}` : "",
    result.stderr.trim() ? `\nstderr:\n${result.stderr.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    content: [{ type: "text" as const, text: summary }],
    isError: result.exitCode !== 0,
  };
}

export function createSeedMcpHttpServer(runner: CliRunner): McpServer {
  const server = new McpServer({
    name: SEED_MCP_SERVER_NAME,
    version: "0.1.0",
  });

  server.tool(
    "seed_grain",
    GRAIN_DESCRIPTION,
    {
      kind: z.enum(SEED_GRAIN_KINDS).describe("Hierarchy grain kind (CLI grain kinds)."),
      competition: z.string().min(1).optional().describe("Competition name or slug."),
      clubId: z.string().min(1).optional().describe("Club Transfermarkt id for club kinds."),
      ntRef: z.string().min(1).optional().describe("NationalTeam ref for national-team kinds."),
      season: z.string().min(1).optional().describe("Season label when the grain kind needs one."),
      lane: laneSchema,
    },
    async (input) => {
      const result = await runSeedGrain(
        {
          kind: input.kind,
          competition: input.competition,
          clubId: input.clubId,
          ntRef: input.ntRef,
          season: input.season,
          lane: input.lane,
        },
        runner,
      );
      return toolResult("seed_grain", result, input.lane);
    },
  );

  server.tool(
    "seed_join",
    JOIN_DESCRIPTION,
    {
      subcommand: z.enum(["club", "national-team", "sentence"]).describe("Join workflow path."),
      competition: z.string().min(1).optional().describe("Competition for join club."),
      ntRef: z.string().min(1).optional().describe("NationalTeam ref for join national-team."),
      season: z.string().min(1).optional().describe("Season for join club or national-team."),
      sentence: z.string().min(1).optional().describe("Natural-language Join sentence (ADR-0014)."),
      lane: laneSchema,
    },
    async (input) => {
      const result = await runSeedJoin(
        {
          subcommand: input.subcommand,
          competition: input.competition,
          ntRef: input.ntRef,
          season: input.season,
          sentence: input.sentence,
          lane: input.lane,
        },
        runner,
      );
      return toolResult("seed_join", result, input.lane);
    },
  );

  return server;
}
