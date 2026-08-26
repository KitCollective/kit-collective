/**
 * Capacity gate (KIT-87 / ADR-0023).
 *
 * Before a coding-job spawn, free RAM and worktree-volume disk must clear env floors.
 * Fail closed: no Pi spawn. Job stays queued. One Linear comment, updated in place.
 * Status unchanged — not Timeout park. Planner is not gated.
 */

import { statfs } from "node:fs/promises";
import os from "node:os";
import { dirname } from "node:path";

export const DEFAULT_RAM_FLOOR_MB = 2048;
export const DEFAULT_DISK_FLOOR_MB = 5120;
export const DEFAULT_CAPACITY_POLL_MS = 15_000;
export const CAPACITY_COMMENT_HEADING = "## Capacity gate";

/**
 * @param {string | undefined} raw
 * @param {number} fallback
 * @returns {number}
 */
export function parseFloorMb(raw, fallback) {
  if (typeof raw !== "string" || raw.length === 0) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined> | undefined} env
 */
export function floorsFromEnv(env = {}) {
  return {
    ramFloorMb: parseFloorMb(env.PI_CAPACITY_RAM_MB, DEFAULT_RAM_FLOOR_MB),
    diskFloorMb: parseFloorMb(env.PI_CAPACITY_DISK_MB, DEFAULT_DISK_FLOOR_MB),
  };
}

/**
 * @param {{ ramFreeMb: number, diskFreeMb: number, ramFloorMb: number, diskFloorMb: number }} input
 */
export function evaluateCapacity({ ramFreeMb, diskFreeMb, ramFloorMb, diskFloorMb }) {
  return {
    ramFreeMb,
    diskFreeMb,
    ready: ramFreeMb >= ramFloorMb && diskFreeMb >= diskFloorMb,
  };
}

/**
 * Free megabytes on the volume that holds `targetDir`.
 * ENOENT walks to an existing parent on the same volume (fresh kit_pi has no worktrees dir yet).
 * Any other error, or walking off the root, fails closed at 0.
 *
 * @param {string} targetDir
 * @param {(path: string) => Promise<{ bavail: number | bigint, bsize: number | bigint }>} [statfsFn]
 * @returns {Promise<number>}
 */
export async function diskFreeMbOnVolume(targetDir, statfsFn = statfs) {
  let path = targetDir;
  for (;;) {
    try {
      const stats = await statfsFn(path);
      return Math.floor((Number(stats.bavail) * Number(stats.bsize)) / (1024 * 1024));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        return 0;
      }
      const parent = dirname(path);
      if (parent === path) {
        return 0;
      }
      path = parent;
    }
  }
}

/**
 * @param {{
 *   worktreesDir?: string,
 *   statfs?: (path: string) => Promise<{ bavail: number | bigint, bsize: number | bigint }>,
 * }} [input]
 */
export function createOsCapacityReaders({
  worktreesDir = "/var/lib/kit-pi/worktrees",
  statfs: statfsFn = statfs,
} = {}) {
  return {
    async ramFreeMb() {
      return Math.floor(os.freemem() / (1024 * 1024));
    },
    async diskFreeMb() {
      return diskFreeMbOnVolume(worktreesDir, statfsFn);
    },
  };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   readRamFreeMb?: () => Promise<number>,
 *   readDiskFreeMb?: () => Promise<number>,
 *   worktreesDir?: string,
 *   statfs?: (path: string) => Promise<{ bavail: number | bigint, bsize: number | bigint }>,
 * }} [input]
 */
export async function snapshotCapacity({
  env = {},
  readRamFreeMb,
  readDiskFreeMb,
  worktreesDir,
  statfs: statfsFn,
} = {}) {
  const floors = floorsFromEnv(env);
  const osReaders = createOsCapacityReaders({
    worktreesDir: worktreesDir ?? env.KIT_PI_WORKTREES ?? "/var/lib/kit-pi/worktrees",
    statfs: statfsFn,
  });
  const ramFreeMb = await (readRamFreeMb ?? osReaders.ramFreeMb)();
  const diskFreeMb = await (readDiskFreeMb ?? osReaders.diskFreeMb)();
  return evaluateCapacity({ ramFreeMb, diskFreeMb, ...floors });
}

/**
 * @param {{ ramFreeMb: number, diskFreeMb: number, ready?: boolean }} capacity
 * @param {{ ramFloorMb: number, diskFloorMb: number }} floors
 * @param {{ identifier?: string }} [job]
 */
export function capacityCommentBody(capacity, floors, job = {}) {
  const identifier = typeof job.identifier === "string" ? job.identifier : "coding job";
  return `${CAPACITY_COMMENT_HEADING}

${identifier} is waiting for free RAM and worktree-volume disk.

- RAM free: ${capacity.ramFreeMb} MB (floor ${floors.ramFloorMb} MB)
- Disk free: ${capacity.diskFreeMb} MB (floor ${floors.diskFloorMb} MB)

Status is unchanged. Not Timeout park. Planner may still run.
`;
}

/**
 * @param {{
 *   linear: {
 *     listComments?: (issueId: string) => Promise<Array<{ id: string, body?: string }>>,
 *     commentIssue: (input: { issueId: string, body: string }) => Promise<{ id?: string } | unknown>,
 *     updateComment?: (input: { id: string, body: string }) => Promise<unknown>,
 *   },
 *   issueId: string,
 *   body: string,
 * }} input
 */
export async function upsertCapacityComment({ linear, issueId, body }) {
  const comments =
    typeof linear.listComments === "function" ? await linear.listComments(issueId) : [];
  const existing = comments.find(
    (comment) =>
      typeof comment.body === "string" && comment.body.includes(CAPACITY_COMMENT_HEADING),
  );
  if (existing && typeof linear.updateComment === "function") {
    await linear.updateComment({ id: existing.id, body });
    return existing.id;
  }
  const created = await linear.commentIssue({ issueId, body });
  return created && typeof created === "object" && typeof created.id === "string"
    ? created.id
    : undefined;
}

/**
 * Poll until RAM and disk clear the floors. Does not change Linear status.
 *
 * @param {{
 *   readCapacity: () => Promise<{ ramFreeMb: number, diskFreeMb: number, ready?: boolean }>,
 *   floors: { ramFloorMb: number, diskFloorMb: number },
 *   linear?: {
 *     listComments?: (issueId: string) => Promise<Array<{ id: string, body?: string }>>,
 *     commentIssue?: (input: { issueId: string, body: string }) => Promise<unknown>,
 *     updateComment?: (input: { id: string, body: string }) => Promise<unknown>,
 *     setStatus?: (input: object) => Promise<unknown>,
 *   },
 *   issueId?: string,
 *   identifier?: string,
 *   sleep?: (ms: number) => Promise<unknown>,
 *   pollMs?: number,
 * }} input
 */
export async function waitForCapacity({
  readCapacity,
  floors,
  linear,
  issueId,
  identifier,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pollMs = DEFAULT_CAPACITY_POLL_MS,
}) {
  while (true) {
    const raw = await readCapacity();
    const capacity = evaluateCapacity({
      ramFreeMb: raw.ramFreeMb,
      diskFreeMb: raw.diskFreeMb,
      ...floors,
    });
    if (capacity.ready) {
      return capacity;
    }
    if (linear && typeof linear.commentIssue === "function" && typeof issueId === "string") {
      await upsertCapacityComment({
        linear,
        issueId,
        body: capacityCommentBody(capacity, floors, { identifier }),
      });
    }
    await sleep(pollMs);
  }
}

const UNKNOWN_TOKEN_COUNT = "unknown";

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isHealthTokenCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Last coding-job token totals for `/health`. Null when none. Never secrets.
 *
 * @param {unknown} tokens
 * @returns {{
 *   role: string,
 *   identifier: string,
 *   lines: Array<{ role: string, model: string, input: number | "unknown", output: number | "unknown" }>,
 * } | null}
 */
export function publicHealthTokens(tokens) {
  if (tokens === null || tokens === undefined || typeof tokens !== "object") {
    return null;
  }
  const record = /** @type {Record<string, unknown>} */ (tokens);
  if (typeof record.role !== "string" || typeof record.identifier !== "string") {
    return null;
  }
  if (!Array.isArray(record.lines)) {
    return null;
  }
  return {
    role: record.role,
    identifier: record.identifier,
    lines: record.lines.map((line) => {
      const row =
        line && typeof line === "object" ? /** @type {Record<string, unknown>} */ (line) : {};
      return {
        role: typeof row.role === "string" ? row.role : UNKNOWN_TOKEN_COUNT,
        model: typeof row.model === "string" ? row.model : UNKNOWN_TOKEN_COUNT,
        input: isHealthTokenCount(row.input) ? row.input : UNKNOWN_TOKEN_COUNT,
        output: isHealthTokenCount(row.output) ? row.output : UNKNOWN_TOKEN_COUNT,
      };
    }),
  };
}

/**
 * Spec health body. `job` stays null unless a sibling slice injects a snapshot.
 * `tokens` is the last implement / factory-checker totals, or null.
 *
 * @param {{
 *   planner?: string,
 *   job?: { role: string, identifier: string } | null,
 *   capacity: { ramFreeMb: number, diskFreeMb: number, ready: boolean },
 *   tokens?: unknown,
 * }} input
 */
export function workerHealthBody({ planner = "active", job = null, capacity, tokens = null }) {
  return { ok: true, planner, job, capacity, tokens: publicHealthTokens(tokens) };
}
