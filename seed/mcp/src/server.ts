import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ProductionLaneRejectedError,
  UnknownLaneError,
  prepareSeedRun,
  type SeedToolInput,
  type SeedToolName,
} from "./prepare-seed-run.ts";
import { formatSeedCliResult, runPreparedSeedCli } from "./run-cli.ts";
import { SEED_TOOL_DEFINITIONS } from "./tools.ts";

const seedToolInputSchema = {
  competition: z
    .string()
    .min(1)
    .describe("Competition name as the CLI accepts it, e.g. Superligaen."),
  fromSeason: z
    .string()
    .min(1)
    .describe(
      "Inclusive start season. `0001` means that competition's first season.",
    ),
  toSeason: z
    .string()
    .min(1)
    .describe("Inclusive end season, e.g. 2026 or 1998/99."),
  lane: z
    .enum(["development", "staging"])
    .optional()
    .describe(
      "Omit for the development database. Pass staging only when the human named that lane. Production is not a valid value.",
    ),
};

async function handleSeedTool(tool: SeedToolName, input: SeedToolInput) {
  try {
    const run = prepareSeedRun(tool, input);
    const result = await runPreparedSeedCli(run);
    const text = formatSeedCliResult(run, result);
    return {
      content: [{ type: "text" as const, text }],
      isError: result.exitCode !== 0,
    };
  } catch (error) {
    const message =
      error instanceof ProductionLaneRejectedError ||
      error instanceof UnknownLaneError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    return {
      content: [{ type: "text" as const, text: message }],
      isError: true,
    };
  }
}

export function createSeedMcpServer(): McpServer {
  const server = new McpServer({
    name: "kitcollective-seed",
    version: "0.0.0",
  });

  for (const tool of SEED_TOOL_DEFINITIONS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: seedToolInputSchema,
      },
      (args) => handleSeedTool(tool.name, args),
    );
  }

  return server;
}

async function main(): Promise<void> {
  const server = createSeedMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const thisFile = fileURLToPath(import.meta.url);
const invokedAsScript =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === thisFile;

if (invokedAsScript) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
