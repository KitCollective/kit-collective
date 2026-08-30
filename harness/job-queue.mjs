/**
 * Worker job mutexes: Planner mutex, Resume mutex, plus a coding pool (implement + checker)
 * and a Finisher slot (auto-merge + land).
 * Compose replicas stay at 1; these mutexes are the in-process seam.
 */
import {
  capacityCommentBody,
  DEFAULT_CAPACITY_POLL_MS,
  evaluateCapacity,
  floorsFromEnv,
  upsertCapacityComment,
} from "./capacity.mjs";
import { harnessLog, loopRiskForGate, loopRiskForRetry, resolveExitGate } from "./harness-log.mjs";

/**
 * Worker health capacity stub when no reader is injected.
 * KIT-87 overlays live RAM/disk readers on GET /health and before spawn.
 * Values are above the Capacity gate floors.
 */
export const ALWAYS_READY_CAPACITY = Object.freeze({
  ramFreeMb: 4096,
  diskFreeMb: 10240,
  ready: true,
});

/**
 * One Pi job at a time per slot. Compose replicas stay at 1; these mutexes are the in-process seam.
 *
 * One Implementing stay is one try: it ends at In Review. Cheap in-slot re-spawns
 * (`ciRetry` / `writeScopeRetry` / `formatRetry` / `migrationRetry`) are not tries —
 * they do not increment reviewLoops / ciFailCycles, do not post a retry-cap comment,
 * and do not make resume skip. They re-run the same implement job until GitHub is
 * green or the cheap-retry bound yields the slot (stay Implementing; resume may
 * continue). Never enqueue factory-checker. Write-scope retry keeps the slot so an
 * out-of-glob path cannot drop the issue behind a resume overlap skip (KIT-119).
 */
export const IMPLEMENT_CI_RETRY_CAP = 5;

/**
 * Cheap in-slot retry: Scout+helpers already ran on attempt 1.
 *
 * @param {object | undefined} job
 */
export function isCheapImplementRetry(job) {
  if (job?.role !== "implement") {
    return false;
  }
  return (
    Number(job.ciRetryAttempt ?? 1) > 1 ||
    Number(job.writeScopeRetryAttempt ?? 1) > 1 ||
    Number(job.formatRetryAttempt ?? 1) > 1 ||
    Number(job.migrationRetryAttempt ?? 1) > 1
  );
}

/**
 * Re-run implement in the same slot on CI, write-scope, format, or migration retry.
 * At the cheap-retry bound, yield the slot (return the last result) instead of
 * throwing a retry-cap hold.
 *
 * @param {object} job
 * @param {unknown} result
 * @param {number} attempt
 * @param {string} reason
 */
function yieldCheapRetry(job, result, attempt, reason) {
  harnessLog({
    role: job.role,
    identifier: job.identifier,
    event: "retry",
    gate: "yellow",
    reason: `${reason}-yield`,
    attempt,
    loopRisk: loopRiskForRetry(attempt, IMPLEMENT_CI_RETRY_CAP),
  });
  return result;
}

/**
 * Re-run implement in the same slot on CI, write-scope, format, or migration retry.
 *
 * @param {(job: object) => Promise<unknown>} run
 * @param {object} job
 * @returns {Promise<unknown>}
 */
export async function runImplementWithRetries(run, job) {
  const result = await run(job);
  if (result?.ciRetry === true) {
    const attempt = Number(job.ciRetryAttempt ?? 1);
    if (job.role !== "implement") {
      return result;
    }
    if (attempt >= IMPLEMENT_CI_RETRY_CAP) {
      return yieldCheapRetry(job, result, attempt, "ci");
    }
    harnessLog({
      role: job.role,
      identifier: job.identifier,
      event: "retry",
      gate: "yellow",
      reason: "ci",
      attempt: attempt + 1,
      loopRisk: loopRiskForRetry(attempt + 1, IMPLEMENT_CI_RETRY_CAP),
    });
    return runImplementWithRetries(run, { ...job, ciRetryAttempt: attempt + 1 });
  }
  if (result?.writeScopeRetry === true) {
    const attempt = Number(job.writeScopeRetryAttempt ?? 1);
    if (job.role !== "implement") {
      return result;
    }
    if (attempt >= IMPLEMENT_CI_RETRY_CAP) {
      return yieldCheapRetry(job, result, attempt, "write-scope");
    }
    harnessLog({
      role: job.role,
      identifier: job.identifier,
      event: "retry",
      gate: "yellow",
      reason: "write-scope",
      attempt: attempt + 1,
      loopRisk: loopRiskForRetry(attempt + 1, IMPLEMENT_CI_RETRY_CAP),
    });
    return runImplementWithRetries(run, { ...job, writeScopeRetryAttempt: attempt + 1 });
  }
  if (result?.formatRetry === true) {
    const attempt = Number(job.formatRetryAttempt ?? 1);
    if (job.role !== "implement") {
      return result;
    }
    if (attempt >= IMPLEMENT_CI_RETRY_CAP) {
      return yieldCheapRetry(job, result, attempt, "format");
    }
    harnessLog({
      role: job.role,
      identifier: job.identifier,
      event: "retry",
      gate: "yellow",
      reason: "format",
      attempt: attempt + 1,
      loopRisk: loopRiskForRetry(attempt + 1, IMPLEMENT_CI_RETRY_CAP),
    });
    return runImplementWithRetries(run, { ...job, formatRetryAttempt: attempt + 1 });
  }
  if (result?.migrationRetry === true) {
    const attempt = Number(job.migrationRetryAttempt ?? 1);
    if (job.role !== "implement") {
      return result;
    }
    if (attempt >= IMPLEMENT_CI_RETRY_CAP) {
      return yieldCheapRetry(job, result, attempt, "migration");
    }
    harnessLog({
      role: job.role,
      identifier: job.identifier,
      event: "retry",
      gate: "yellow",
      reason: "migration",
      attempt: attempt + 1,
      loopRisk: loopRiskForRetry(attempt + 1, IMPLEMENT_CI_RETRY_CAP),
    });
    return runImplementWithRetries(run, { ...job, migrationRetryAttempt: attempt + 1 });
  }
  return result;
}

export const DEFAULT_IMPLEMENT_SLOTS = 4;
export const MIN_IMPLEMENT_SLOTS = 1;
export const MAX_IMPLEMENT_SLOTS = 4;

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined> | undefined} [env]
 * @returns {number}
 */
export function parseImplementSlots(env = {}) {
  const raw = env.PI_IMPLEMENT_SLOTS;
  if (typeof raw !== "string" || raw.length === 0) {
    return DEFAULT_IMPLEMENT_SLOTS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_IMPLEMENT_SLOTS;
  }
  return Math.min(MAX_IMPLEMENT_SLOTS, Math.max(MIN_IMPLEMENT_SLOTS, Math.floor(parsed)));
}

/**
 * @param {{ run: (job: object) => Promise<unknown> }} deps
 */
export function createSerialQueue(deps) {
  let tail = Promise.resolve();

  /**
   * @param {object} job
   */
  async function runMaybeRetry(job) {
    return runImplementWithRetries(deps.run, job);
  }

  return {
    /**
     * @param {object} job
     */
    enqueue(job) {
      const next = tail.then(
        () => runMaybeRetry(job),
        () => runMaybeRetry(job),
      );
      tail = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}

const PLANNER_MUTEX_ROLES = new Set(["planner", "intake"]);
const RESUME_MUTEX_ROLES = new Set(["resume"]);
const CODING_POOL_ROLES = new Set(["implement", "factory-checker"]);
const FINISHER_ROLES = new Set(["auto-merge", "land"]);
const CODING_ROLES = new Set([...CODING_POOL_ROLES, ...FINISHER_ROLES]);

/**
 * Planner mutex plus a Resume mutex, a coding pool (default 4: implement + factory-checker)
 * and one reserved Finisher slot (auto-merge / land). Resume must not wait behind a hung planner or Intake.
 *
 * @param {{
 *   run: (job: object) => Promise<unknown>,
 *   capacity?: { ramFreeMb: number, diskFreeMb: number, ready: boolean },
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   readCapacity?: () => Promise<{ ramFreeMb: number, diskFreeMb: number, ready?: boolean }>,
 *   linear?: {
 *     listComments?: (issueId: string) => Promise<Array<{ id: string, body?: string }>>,
 *     commentIssue?: (input: { issueId: string, body: string }) => Promise<{ id?: string } | unknown>,
 *     updateComment?: (input: { id: string, body: string }) => Promise<unknown>,
 *   },
 * }} deps
 */
export function createWorkerSlots(deps) {
  const maxImplementSlots = parseImplementSlots(deps.env);
  const capacity = deps.capacity ?? ALWAYS_READY_CAPACITY;
  const floors = floorsFromEnv(deps.env);

  /** @type {Array<{ role: string, identifier: string, slot: "implement" | "finisher" }>} */
  const runningJobs = [];
  /** @type {object[]} */
  const pendingCoding = [];
  let implementActive = 0;
  let finisherActive = false;
  let dispatchTail = Promise.resolve();
  /** @type {ReturnType<typeof setTimeout> | null} */
  let capacityRetryTimer = null;

  const plannerQueue = createSerialQueue({
    run(job) {
      return deps.run(job);
    },
  });
  const resumeQueue = createSerialQueue({
    run(job) {
      return deps.run(job);
    },
  });

  /**
   * @param {object} job
   */
  async function runMaybeRetry(job) {
    return runImplementWithRetries(deps.run, job);
  }

  /**
   * @param {object} job
   * @param {"implement" | "finisher"} slot
   */
  async function executeJob(job, slot) {
    const identifier = job.identifier ?? job.issueId ?? "unknown";
    const entry = { role: job.role, identifier, slot };
    runningJobs.push(entry);
    if (slot === "implement") {
      implementActive += 1;
    } else {
      finisherActive = true;
    }
    harnessLog({ role: job.role, identifier, event: "start", gate: "green" });
    try {
      const result = await runMaybeRetry(job);
      if (
        !(
          result &&
          typeof result === "object" &&
          (result.idleTimeout === true || result.retryCapHold === true)
        )
      ) {
        const exitGate = resolveExitGate(result, job);
        harnessLog({
          role: job.role,
          identifier,
          event: "exit",
          gate: exitGate,
          loopRisk: loopRiskForGate(exitGate),
        });
      }
      job._deferred?.resolve(result);
      return result;
    } catch (error) {
      job._deferred?.reject(error);
      harnessLog({
        role: job.role,
        identifier,
        event: "fail",
        gate: "red",
        error,
        loopRisk: 10,
      });
      throw error;
    } finally {
      const index = runningJobs.indexOf(entry);
      if (index >= 0) {
        runningJobs.splice(index, 1);
      }
      if (slot === "implement") {
        implementActive -= 1;
      } else {
        finisherActive = false;
      }
      scheduleDispatch();
    }
  }

  /**
   * @param {object} job
   * @param {"implement" | "finisher"} slot
   */
  function startJob(job, slot) {
    executeJob(job, slot).catch(() => undefined);
  }

  function scheduleCapacityRetry() {
    if (capacityRetryTimer !== null) {
      return;
    }
    const pollMs = Number(deps.env?.PI_CAPACITY_POLL_MS ?? DEFAULT_CAPACITY_POLL_MS);
    capacityRetryTimer = setTimeout(() => {
      capacityRetryTimer = null;
      scheduleDispatch();
    }, pollMs);
  }

  function scheduleDispatch() {
    dispatchTail = dispatchTail.then(() => dispatchPendingAsync()).catch(() => undefined);
  }

  /**
   * When one implement is already live, a second must not occupy a slot until capacity clears.
   * The first implement may wait inside `pi-job.run`; queued jobs stay in `health().queued`.
   *
   * @param {object} job
   */
  async function capacityBlocksSecondImplement(job) {
    if (!CODING_POOL_ROLES.has(job.role) || implementActive < 1) {
      return false;
    }
    if (typeof deps.readCapacity !== "function") {
      return false;
    }
    const raw = await deps.readCapacity();
    const snapshot = evaluateCapacity({
      ramFreeMb: raw.ramFreeMb,
      diskFreeMb: raw.diskFreeMb,
      ...floors,
    });
    if (snapshot.ready) {
      return false;
    }
    if (
      deps.linear &&
      typeof deps.linear.commentIssue === "function" &&
      typeof job.issueId === "string"
    ) {
      await upsertCapacityComment({
        linear: deps.linear,
        issueId: job.issueId,
        body: capacityCommentBody(snapshot, floors, job),
      });
    }
    harnessLog({
      role: job.role,
      identifier: job.identifier ?? job.issueId,
      event: "wait",
      gate: "yellow",
      reason: "capacity",
      loopRisk: 4,
    });
    scheduleCapacityRetry();
    return true;
  }

  async function dispatchPendingAsync() {
    if (!finisherActive) {
      const finisherIdx = pendingCoding.findIndex((row) => FINISHER_ROLES.has(row.role));
      if (finisherIdx >= 0) {
        const job = pendingCoding.splice(finisherIdx, 1)[0];
        startJob(job, "finisher");
      }
    }
    while (implementActive < maxImplementSlots) {
      const codingIdx = pendingCoding.findIndex((row) => CODING_POOL_ROLES.has(row.role));
      if (codingIdx < 0) {
        break;
      }
      const job = pendingCoding[codingIdx];
      if (await capacityBlocksSecondImplement(job)) {
        break;
      }
      pendingCoding.splice(codingIdx, 1);
      startJob(job, "implement");
    }
  }

  function canStartNow(job) {
    if (CODING_POOL_ROLES.has(job.role)) {
      return implementActive < maxImplementSlots;
    }
    if (FINISHER_ROLES.has(job.role)) {
      return !finisherActive;
    }
    return false;
  }

  function slotFor(job) {
    if (CODING_POOL_ROLES.has(job.role)) {
      return "implement";
    }
    if (FINISHER_ROLES.has(job.role)) {
      return "finisher";
    }
    throw new Error(`no slot for role ${job.role}`);
  }

  return {
    /**
     * @param {object} job
     */
    enqueue(job) {
      if (RESUME_MUTEX_ROLES.has(job.role)) {
        const resumed = resumeQueue.enqueue(job);
        resumed.catch((error) => {
          console.error(`resume job failed: ${error instanceof Error ? error.message : error}`);
        });
        return resumed;
      }
      if (PLANNER_MUTEX_ROLES.has(job.role)) {
        const planned = plannerQueue.enqueue(job);
        planned.catch((error) => {
          console.error(
            `${job.role} job failed: ${error instanceof Error ? error.message : error}`,
          );
        });
        return planned;
      }
      if (!CODING_ROLES.has(job.role)) {
        throw new Error(`no coding slot for role ${job.role}`);
      }

      if (CODING_POOL_ROLES.has(job.role)) {
        const id = job.identifier;
        if (typeof id === "string" && id.length > 0) {
          const occupied =
            runningJobs.some((row) => row.identifier === id && row.role === job.role) ||
            pendingCoding.some((row) => row.identifier === id && row.role === job.role);
          if (occupied) {
            harnessLog({
              role: job.role,
              identifier: id,
              event: "skip",
              gate: "yellow",
              reason: "already running",
              loopRisk: 3,
            });
            return Promise.resolve({ skipped: true, reason: "already running" });
          }
        }
      }

      /** @type {{ resolve: (value: unknown) => void, reject: (reason?: unknown) => void }} */
      let deferred;
      const promise = new Promise((resolve, reject) => {
        deferred = { resolve, reject };
      });
      const entry = { ...job, _deferred: deferred };

      const needsCapacityDispatch =
        CODING_POOL_ROLES.has(entry.role) &&
        implementActive >= 1 &&
        typeof deps.readCapacity === "function";

      if (canStartNow(entry) && !needsCapacityDispatch) {
        startJob(entry, slotFor(entry));
      } else {
        pendingCoding.push(entry);
        scheduleDispatch();
      }

      promise.catch(() => undefined);
      return promise;
    },
    queuedIdentifiers() {
      const identifiers = [
        ...runningJobs.map((row) => row.identifier),
        ...pendingCoding.map((row) => row.identifier),
      ].filter((identifier) => typeof identifier === "string" && identifier.length > 0);
      return [...new Set(identifiers)];
    },
    health() {
      const jobs = runningJobs.map(({ role, identifier }) => ({ role, identifier }));
      const queued = [
        ...new Set(
          pendingCoding
            .map((row) => row.identifier)
            .filter((identifier) => typeof identifier === "string" && identifier.length > 0),
        ),
      ];
      return {
        planner: "active",
        jobs,
        queued,
        job: jobs[0] ?? null,
        capacity,
      };
    },
  };
}
