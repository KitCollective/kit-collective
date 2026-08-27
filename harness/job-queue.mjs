/**
 * Worker job mutexes: one Planner job mutex plus one Coding job slot.
 * Compose replicas stay at 1; these mutexes are the in-process seam.
 */

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
 * One Pi job at a time. Compose replicas stay at 1; this mutex is the in-process seam.
 *
 * Implement CI retry: when `run` returns `{ ciRetry: true }`, re-run the same
 * implement job (same issue / worktree / PR) until required checks are green
 * or the cap is hit. Fail closed at the cap. Never enqueue factory-checker.
 */
export const IMPLEMENT_CI_RETRY_CAP = 3;

/**
 * @param {{ run: (job: object) => Promise<unknown> }} deps
 */
export function createSerialQueue(deps) {
  let tail = Promise.resolve();

  /**
   * @param {object} job
   */
  async function runMaybeRetry(job) {
    const result = await deps.run(job);
    if (result?.ciRetry !== true) {
      return result;
    }
    const attempt = Number(job.ciRetryAttempt ?? 1);
    if (job.role !== "implement" || attempt >= IMPLEMENT_CI_RETRY_CAP) {
      throw new Error("implement CI retry cap hit");
    }
    return runMaybeRetry({ ...job, ciRetryAttempt: attempt + 1 });
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

const PLANNER_MUTEX_ROLES = new Set(["planner", "intake", "resume"]);
const CODING_ROLES = new Set(["implement", "factory-checker", "auto-merge", "land"]);

/**
 * Two mutexes: Planner job vs one Coding job slot
 * (implement / factory-checker / auto-merge / land).
 *
 * @param {{
 *   run: (job: object) => Promise<unknown>,
 *   capacity?: { ramFreeMb: number, diskFreeMb: number, ready: boolean },
 * }} deps
 */
export function createWorkerSlots(deps) {
  let currentJob = null;
  const pendingCoding = [];
  const capacity = deps.capacity ?? ALWAYS_READY_CAPACITY;

  const plannerQueue = createSerialQueue({
    run(job) {
      return deps.run(job);
    },
  });

  const codingQueue = createSerialQueue({
    async run(job) {
      currentJob = {
        role: job.role,
        identifier: job.identifier ?? job.issueId ?? "unknown",
      };
      try {
        return await deps.run(job);
      } finally {
        currentJob = null;
      }
    },
  });

  return {
    /**
     * @param {object} job
     */
    enqueue(job) {
      if (PLANNER_MUTEX_ROLES.has(job.role)) {
        return plannerQueue.enqueue(job);
      }
      if (!CODING_ROLES.has(job.role)) {
        throw new Error(`no coding slot for role ${job.role}`);
      }
      pendingCoding.push(job);
      const done = codingQueue.enqueue(job);
      return done.finally(() => {
        const index = pendingCoding.indexOf(job);
        if (index >= 0) {
          pendingCoding.splice(index, 1);
        }
      });
    },
    queuedIdentifiers() {
      return [
        ...new Set(
          pendingCoding
            .map((job) => job.identifier)
            .filter((identifier) => typeof identifier === "string" && identifier.length > 0),
        ),
      ];
    },
    health() {
      return {
        planner: "active",
        job: currentJob,
        capacity,
      };
    },
  };
}
