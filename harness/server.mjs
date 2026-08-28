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
import { DEFAULT_INTAKE_POLL_MS, startIntakePoller } from "./intake.mjs";
import { ALWAYS_READY_CAPACITY, createWorkerSlots } from "./job-queue.mjs";
import { createLinearCliClient } from "./linear-cli.mjs";
import { assertPiPackagesReady, createPiJobRunner, resolvePiWorkspace } from "./pi-job.mjs";
import { DEFAULT_PLANNER_POLL_MS, startPlannerPoller } from "./planner.mjs";
import { runResume, startResumePoller } from "./resume.mjs";
import { createHttpHandler } from "./webhook-router.mjs";
import { createWorktreeAdapter } from "./worktree.mjs";

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
      let capacity = snapshot.capacity ?? ALWAYS_READY_CAPACITY;
      if (typeof deps.readCapacity === "function") {
        const raw = await deps.readCapacity();
        capacity =
          raw && typeof raw.ready === "boolean"
            ? { ramFreeMb: raw.ramFreeMb, diskFreeMb: raw.diskFreeMb, ready: raw.ready }
            : evaluateCapacity({ ...raw, ...floorsFromEnv(deps.env) });
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          workerHealthBody({
            planner: snapshot.planner ?? "active",
            job: snapshot.job === undefined ? null : snapshot.job,
            jobs: snapshot.jobs,
            queued: snapshot.queued,
            capacity,
            tokens: snapshot.tokens === undefined ? null : snapshot.tokens,
          }),
        ),
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
  intakePollMs,
  readCapacity,
} = {}) {
  assertWorkerEnv(env);
  const workspace = resolvePiWorkspace(env);
  await assertPiPackagesReady({ root: workspace, listPackages });
  const linearClient = linear ?? createLinearCliClient({ env, runCommand });
  const ghClient = createGhClient({ env, runCommand });
  const trees = createWorktreeAdapter({ env });
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
          worktree: trees,
          spawnProcess,
          runCommand,
          gh: ghClient,
          linear: linearClient,
          typecheckTouched: createTypecheckTouched({ runCommand }),
          readCapacity: capacitySnapshot,
        });
  let lastTokens = null;
  const delegateGateConfig = createDelegateGateConfig(env);
  let slots;
  slots = createWorkerSlots({
    env,
    readCapacity: capacitySnapshot,
    linear: linearClient,
    async run(job) {
      if (job.role === "resume") {
        return runResume({
          env,
          linear: linearClient,
          enqueue: slots,
          delegateGateConfig,
          queuedIdentifiers: slots.queuedIdentifiers(),
        });
      }
      const result = await runner.run(job);
      if (job.role === "implement" || job.role === "factory-checker") {
        lastTokens =
          result && typeof result === "object" && result.tokens ? result.tokens : lastTokens;
      }
      return result;
    },
  });
  const pollMs =
    typeof plannerPollMs === "number"
      ? plannerPollMs
      : Number(env.PI_PLANNER_POLL_MS ?? DEFAULT_PLANNER_POLL_MS);
  const intakeMs =
    typeof intakePollMs === "number"
      ? intakePollMs
      : Number(env.PI_INTAKE_POLL_MS ?? DEFAULT_INTAKE_POLL_MS);
  const handler = createWorkerHandler({
    env,
    secret: env.LINEAR_WEBHOOK_SECRET,
    now,
    linear: linearClient,
    gh: { tokenName: "GH_TOKEN" },
    enqueue: slots,
    health: () => ({ ...slots.health(), tokens: lastTokens }),
    worktree: trees,
    delegateGateConfig,
    readCapacity: capacitySnapshot,
  });
  const server = createServer(handler);
  let stopPoller = () => {};
  let stopResumePoller = () => {};
  let stopIntakePoller = () => {};
  server.on("close", () => {
    stopPoller();
    stopResumePoller();
    stopIntakePoller();
  });
  return new Promise((resolve) => {
    server.listen(listenPort, listenHost, () => {
      if (pollMs > 0) {
        stopPoller = startPlannerPoller({ enqueue: slots, intervalMs: pollMs });
        stopResumePoller = startResumePoller({ enqueue: slots, intervalMs: pollMs });
      }
      if (intakeMs > 0) {
        stopIntakePoller = startIntakePoller({ enqueue: slots, intervalMs: intakeMs });
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
