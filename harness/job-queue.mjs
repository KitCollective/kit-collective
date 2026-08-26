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
