/**
 * Production HTTP adapter for the KIT-52 webhook router (Compose on the PI box).
 * GET /health is for Compose/Hetzner probes. POST goes to HMAC dispatch.
 * Default Linear + Pi adapters are real CLI processes; tests inject fakes.
 */
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { assertWorkerEnv } from "./boot-env.mjs";
import { createDelegateGateConfig } from "./delegate-gate.mjs";
import { createGhClient } from "./gh-cli.mjs";
import { createTypecheckTouched } from "./implement-exit.mjs";
import { ALWAYS_READY_CAPACITY, createWorkerSlots } from "./job-queue.mjs";
import { createLinearCliClient } from "./linear-cli.mjs";
import { assertPiPackagesReady, createPiJobRunner, resolvePiWorkspace } from "./pi-job.mjs";
import { DEFAULT_PLANNER_POLL_MS, startPlannerPoller } from "./planner.mjs";
import { createLinearSessionAdapter } from "./session-adapter.mjs";
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
      const snapshot = typeof deps.health === "function" ? deps.health() : {};
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          planner: snapshot.planner ?? "active",
          job: snapshot.job === undefined ? null : snapshot.job,
          capacity: snapshot.capacity ?? ALWAYS_READY_CAPACITY,
        }),
      );
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
  plannerPollMs,
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
          runCommand,
          gh: ghClient,
          linear: linearClient,
          session: createLinearSessionAdapter({ linear: linearClient }),
          typecheckTouched: createTypecheckTouched({ runCommand }),
        });
  const slots = createWorkerSlots({
    async run(job) {
      return runner.run(job);
    },
  });
  const pollMs =
    typeof plannerPollMs === "number"
      ? plannerPollMs
      : Number(env.PI_PLANNER_POLL_MS ?? DEFAULT_PLANNER_POLL_MS);
  const handler = createWorkerHandler({
    env,
    secret: env.LINEAR_WEBHOOK_SECRET,
    sessionSecret: env.LINEAR_PI_WEBHOOK_SECRET,
    now,
    linear: linearClient,
    gh: { tokenName: "GH_TOKEN" },
    enqueue: slots,
    health: () => slots.health(),
    session: createLinearSessionAdapter({ linear: linearClient }),
    delegateGateConfig: createDelegateGateConfig(env),
  });
  const server = createServer(handler);
  let stopPoller = () => {};
  server.on("close", () => {
    stopPoller();
  });
  return new Promise((resolve) => {
    server.listen(listenPort, listenHost, () => {
      if (pollMs > 0) {
        stopPoller = startPlannerPoller({ enqueue: slots, intervalMs: pollMs });
      }
      resolve(server);
    });
  });
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startWorkerServer().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
