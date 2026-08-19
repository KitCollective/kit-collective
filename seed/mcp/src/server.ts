import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { type CliRunner, runSeedCli } from "./run-cli.js";

const seedInputSchema = {
  competition: z
    .string()
    .min(1)
    .describe(
      "Competition slug or id (e.g. superligaen, championship). Not limited to Denmark.",
    ),
  fromSeason: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Start season label for competition scope, or 0001 for that competition's first Transfermarkt season.",
    ),
  toSeason: z
    .string()
    .min(1)
    .optional()
    .describe("End season label for competition scope (e.g. 2025/26) or today."),
  club: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Transfermarkt club external id for club scope (e.g. club-190). When set, season is required and from/to are ignored.",
    ),
  season: z
    .string()
    .min(1)
    .optional()
    .describe("Season label for club scope (e.g. 23/24). Required when club is set."),
  lane: z
    .string()
    .optional()
    .describe(
      "Target database lane. Omit for development (CX33 default). Use staging only when the human explicitly names staging. Production is rejected.",
    ),
};

const APIFY_DESCRIPTION = [
  "Run the Apify/Transfermarkt seed CLI for a Seed scope.",
  "",
  "Scopes:",
  "- Competition + season range: competition, fromSeason, toSeason",
  "- Club + one season: competition, club, season",
  "",
  "Pipeline: fetch → normalize (facts only) → map into Postgres. Already seeded club-seasons skip fetch.",
  "",
  "Season shorthand: 0001 = that competition's first Transfermarkt season (Superliga 1991/92).",
  "",
  "Lane rules: default development when lane is omitted; staging only when explicitly named; production is impossible.",
  "",
  "Run Apify seed for a scope before FK seed for the same scope so Kit rows can join on ExternalId.",
].join("\n");

const FK_DESCRIPTION = [
  "Run the Football Kit Archive (FKApi) seed CLI for a competition and season range.",
  "",
  "Writes Kit identity and admin_only KitPhoto bytes (rights: unresolved) to the lane's R2 bucket.",
  "",
  "Season shorthand: 0001 = that competition's first season.",
  "",
  "Requires Club and Season rows for the scope — run seed_apify first for the same competition/range.",
  "",
  "Lane rules: default development when lane is omitted; staging only when explicitly named; production is impossible.",
].join("\n");

export function createSeedMcpServer(runner: CliRunner): McpServer {
  const server = new McpServer({
    name: "kit-collective-seed",
    version: "0.1.0",
  });

  server.tool(
    "seed_apify",
    APIFY_DESCRIPTION,
    seedInputSchema,
    async (input) => {
      const result = await runSeedCli("apify", input, runner);
      if (!result.ok) {
        return {
          content: [{ type: "text", text: result.error }],
          isError: true,
        };
      }

      const summary = [
        `seed_apify exited with code ${result.exitCode}`,
        `lane: ${input.lane?.trim().toLowerCase() || "development"}`,
        result.stdout.trim() ? `\nstdout:\n${result.stdout.trim()}` : "",
        result.stderr.trim() ? `\nstderr:\n${result.stderr.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        content: [{ type: "text", text: summary }],
        isError: result.exitCode !== 0,
      };
    },
  );

  server.tool(
    "seed_fk",
    FK_DESCRIPTION,
    {
      competition: seedInputSchema.competition,
      fromSeason: z
        .string()
        .min(1)
        .describe("Start season label, or 0001 for that competition's first season."),
      toSeason: z
        .string()
        .min(1)
        .describe("End season label (e.g. 2025/26) or today for the current season."),
      lane: seedInputSchema.lane,
    },
    async (input) => {
      const result = await runSeedCli("fkapi", input, runner);
      if (!result.ok) {
        return {
          content: [{ type: "text", text: result.error }],
          isError: true,
        };
      }

      const summary = [
        `seed_fk exited with code ${result.exitCode}`,
        `lane: ${input.lane?.trim().toLowerCase() || "development"}`,
        result.stdout.trim() ? `\nstdout:\n${result.stdout.trim()}` : "",
        result.stderr.trim() ? `\nstderr:\n${result.stderr.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        content: [{ type: "text", text: summary }],
        isError: result.exitCode !== 0,
      };
    },
  );

  return server;
}

export async function startSeedMcpServer(runner: CliRunner): Promise<void> {
  const server = createSeedMcpServer(runner);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
