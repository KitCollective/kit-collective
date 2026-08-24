/**
 * One Pi job at a time. Compose replicas stay at 1; this mutex is the in-process seam.
 *
 * @param {{ run: (job: object) => Promise<unknown> }} deps
 */
export function createSerialQueue(deps) {
  let tail = Promise.resolve();

  return {
    /**
     * @param {object} job
     */
    enqueue(job) {
      const next = tail.then(
        () => deps.run(job),
        () => deps.run(job),
      );
      tail = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}
