/**
 * Production HTTP adapter for the KIT-52 webhook router (Compose on the PI box).
 * GET /health is for Compose/Hetzner probes. POST goes to HMAC dispatch.
 * Default Linear + Pi adapters are real CLI processes; tests inject fakes.
 */
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { assertWorkerEnv } from "./boot-env.mjs";
import { createGhClient } from "./gh-cli.mjs";
import { createTypecheckTouched } from "./implement-exit.mjs";
import { createSerialQueue } from "./job-queue.mjs";
import { createLinearCliClient } from "./linear-cli.mjs";
import { assertPiPackagesReady, createPiJobRunner, resolvePiWorkspace } from "./pi-job.mjs";
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

export async function startWorkerServer({
  env = process.env,
  listenPort = Number(env.PORT ?? 8080),
  listenHost = "0.0.0.0",
  linear,
  run,
  listPackages,
  runCommand,
  spawnProcess,
  now = () => Date.now(),
} = {}) {
  assertWorkerEnv(env);
  const workspace = resolvePiWorkspace(env);
  await assertPiPackagesReady({ root: workspace, listPackages });
  const linearClient = linear ?? createLinearCliClient({ env, runCommand });
  const ghClient = createGhClient({ env, runCommand });
  const runner =
    typeof run === "function"
      ? { run }
      : createPiJobRunner({
          env,
          workspace,
          spawnProcess,
          gh: ghClient,
          linear: linearClient,
          typecheckTouched: createTypecheckTouched({ runCommand }),
        });
  const queue = createSerialQueue({
    async run(job) {
      return runner.run(job);
    },
  });
  const handler = createWorkerHandler({
    secret: env.LINEAR_WEBHOOK_SECRET,
    now,
    linear: linearClient,
    gh: { tokenName: "GH_TOKEN" },
    enqueue: queue,
    allowedDelegates: ["Pi"],
  });
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(listenPort, listenHost, () => resolve(server));
  });
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startWorkerServer().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
