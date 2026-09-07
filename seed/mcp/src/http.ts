#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { gateSeedMcpHttpRequest, requireSeedMcpTokenForHttp } from "./http-auth.js";
import { createSeedMcpHttpServer } from "./http-server.js";
import { defaultCliRunner } from "./run-cli.js";

export const SEED_MCP_HTTP_PATH = "/mcp";

function requestPath(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  } catch {
    return "/";
  }
}

export function startSeedMcpHttpServer(
  env: NodeJS.ProcessEnv = process.env,
): ReturnType<typeof createServer> {
  const token = requireSeedMcpTokenForHttp(env);
  if (!env.FKAPI_BASE_URL) {
    process.stderr.write(
      "Seed MCP HTTP: FKAPI_BASE_URL is unset; Join FK after facts requires SEED_FK_FETCH=fixture\n",
    );
  }

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (requestPath(req) !== SEED_MCP_HTTP_PATH) {
      res.writeHead(404);
      res.end();
      return;
    }
    await gateSeedMcpHttpRequest(req, res, token, async () => {
      const sessionIdHeader = req.headers["mcp-session-id"];
      const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
      const existing = sessionId ? sessions.get(sessionId) : undefined;
      if (existing) {
        await existing.handleRequest(req, res);
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, transport);
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
      };
      const mcp = createSeedMcpHttpServer(defaultCliRunner);
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    });
  });

  const port = Number(env.PORT ?? "8787");
  const host = env.SEED_MCP_BIND ?? "0.0.0.0";
  httpServer.listen(port, host, () => {
    process.stderr.write(`Seed MCP HTTP listening on ${host}:${port}${SEED_MCP_HTTP_PATH}\n`);
  });
  return httpServer;
}

async function main(): Promise<void> {
  startSeedMcpHttpServer();
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
