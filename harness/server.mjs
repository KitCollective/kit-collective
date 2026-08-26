/**
 * Production HTTP adapter for the KIT-52 webhook router (Compose on the PI box).
 * GET /health is for Compose/Hetzner probes. POST goes to HMAC dispatch.
 * Default Linear + Pi adapters are real CLI processes; tests inject fakes.
 */
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { assertWorkerEnv } from "./boot-env.mjs";
import {
  evaluateCapacity,
  floorsFromEnv,
  snapshotCapacity,
  workerHealthBody,
} from "./capacity.mjs";
import { createDelegateGateConfig } from "./delegate-gate.mjs";
import { createGhClient } from "./gh-cli.mjs";
import { createTypecheckTouched } from "./implement-exit.mjs";
import { createSerialQueue } from "./job-queue.mjs";
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
  const readCapacity =
    typeof deps.readCapacity === "function"
      ? deps.readCapacity
      : () => snapshotCapacity({ env: deps.env });
  const currentJob =
    typeof deps.currentJob === "function" ? deps.currentJob : () => deps.job ?? null;
  return async (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && path === "/health") {
      const raw = await readCapacity();
      const capacity =
        raw && typeof raw.ready === "boolean"
          ? { ramFreeMb: raw.ramFreeMb, diskFreeMb: raw.diskFreeMb, ready: raw.ready }
          : evaluateCapacity({ ...raw, ...floorsFromEnv(deps.env) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(workerHealthBody({ job: currentJob(), capacity })));
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
  readCapacity,
} = {}) {
  assertWorkerEnv(env);
  const workspace = resolvePiWorkspace(env);
  await assertPiPackagesReady({ root: workspace, listPackages });
  const linearClient = linear ?? createLinearCliClient({ env, runCommand });
  const ghClient = createGhClient({ env, runCommand });
  const capacitySnapshot =
    typeof readCapacity === "function"
      ? readCapacity
      : () => snapshotCapacity({ env, worktreesDir: env.KIT_PI_WORKTREES });
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
          readCapacity: capacitySnapshot,
        });
  const queue = createSerialQueue({
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
    enqueue: queue,
    session: createLinearSessionAdapter({ linear: linearClient }),
    delegateGateConfig: createDelegateGateConfig(env),
    readCapacity: capacitySnapshot,
  });
  const server = createServer(handler);
  let stopPoller = () => {};
  server.on("close", () => {
    stopPoller();
  });
  return new Promise((resolve) => {
    server.listen(listenPort, listenHost, () => {
      if (pollMs > 0) {
        stopPoller = startPlannerPoller({ enqueue: queue, intervalMs: pollMs });
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
