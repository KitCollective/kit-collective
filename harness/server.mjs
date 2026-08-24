/**
 * Production HTTP adapter for the KIT-52 webhook router (Compose on the PI box).
 * GET /health is for Compose/Hetzner probes. POST goes to HMAC dispatch.
 */
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { assertWorkerEnv } from "./boot-env.mjs";
import { createSerialQueue } from "./job-queue.mjs";
import { createHttpHandler } from "./webhook-router.mjs";

/**
 * @param {object} deps
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>}
 */
export function createWorkerHandler(deps) {
  const webhook = createHttpHandler(deps);
  return async (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && path === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    return webhook(req, res);
  };
}

export function startWorkerServer({
  env = process.env,
  listenPort = Number(env.PORT ?? 8080),
  linear = { async getIssue() { return null; } },
  gh = {},
  now = () => Date.now(),
} = {}) {
  assertWorkerEnv(env);
  const queue = createSerialQueue({
    async run(job) {
      return job;
    },
  });
  const handler = createWorkerHandler({
    secret: env.LINEAR_WEBHOOK_SECRET,
    now,
    linear,
    gh,
    enqueue: queue,
    allowedDelegates: ["Pi"],
  });
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(listenPort, "0.0.0.0", () => resolve(server));
  });
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startWorkerServer().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
