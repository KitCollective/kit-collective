import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createDb, type Db, externalId, SEED_CREATE_DB_OPTIONS } from "@kit/db";
import { and, asc, eq } from "drizzle-orm";
import { resolveBulkStateDir } from "./bulk-checkpoint.js";
import type { JerseyNumbersFetcher } from "./fetch/adapter.js";
import { TransfermarktCircuitOpenError } from "./fetch/transfermarkt-rate-limit.js";
import { parseLane, resolveDatabaseUrl } from "./lane.js";
import { type JerseyNumberMapResult, mapPlayerJerseyNumbers } from "./map/index.js";
import { normalizePlayerJerseyNumbers } from "./normalize/index.js";
import { describeSeedError, seedProgress } from "./progress.js";
import { type Lane, TM_SYSTEM } from "./types.js";

export const JERSEY_BACKFILL_PLAN_ID = "player-jersey-numbers";

export interface JerseyNumbersFailure {
  playerExternalId: string;
  error: string;
}

export interface JerseyNumbersSummary {
  players: number;
  /** Players skipped because a previous run already recorded them. */
  resumed: number;
  /** Players whose career page listed at least one row. */
  playersWithHistory: number;
  /** Players whose career page listed nothing — a real vendor hole, not a failure. */
  playersEmpty: number;
  /** Players the lane has no `player` row for. */
  playersMissing: number;
  parsedRows: number;
  created: number;
  existing: number;
  clubLinked: number;
  nationalTeamLinked: number;
  sideUnresolved: number;
  seasonLinked: number;
  missingNumber: number;
  sideKindMismatch: number;
  failures: JerseyNumbersFailure[];
  stopped?: "circuit_open";
}

function emptySummary(): JerseyNumbersSummary {
  return {
    players: 0,
    resumed: 0,
    playersWithHistory: 0,
    playersEmpty: 0,
    playersMissing: 0,
    parsedRows: 0,
    created: 0,
    existing: 0,
    clubLinked: 0,
    nationalTeamLinked: 0,
    sideUnresolved: 0,
    seasonLinked: 0,
    missingNumber: 0,
    sideKindMismatch: 0,
    failures: [],
  };
}

function addMapResult(summary: JerseyNumbersSummary, mapped: JerseyNumberMapResult): void {
  summary.parsedRows += mapped.parsedRows;
  summary.created += mapped.created;
  summary.existing += mapped.existing;
  summary.clubLinked += mapped.clubLinked;
  summary.nationalTeamLinked += mapped.nationalTeamLinked;
  summary.sideUnresolved += mapped.sideUnresolved;
  summary.seasonLinked += mapped.seasonLinked;
  summary.missingNumber += mapped.missingNumber;
  summary.sideKindMismatch += mapped.sideKindMismatch;
}

export type JerseyCheckpointStatus = "done" | "failed";

export interface JerseyCheckpointRecord {
  playerExternalId: string;
  status: JerseyCheckpointStatus;
  at: string;
  rows?: number;
  reason?: string;
}

export interface JerseyCheckpoint {
  read(): Promise<JerseyCheckpointRecord[]>;
  append(record: JerseyCheckpointRecord): Promise<void>;
}

function isJerseyCheckpointStatus(value: unknown): value is JerseyCheckpointStatus {
  return value === "done" || value === "failed";
}

function parseJerseyCheckpointRecord(value: unknown): JerseyCheckpointRecord | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  if (!("playerExternalId" in value) || typeof value.playerExternalId !== "string") {
    return undefined;
  }
  if (!("status" in value) || !isJerseyCheckpointStatus(value.status)) {
    return undefined;
  }
  if (!("at" in value) || typeof value.at !== "string") {
    return undefined;
  }
  const record: JerseyCheckpointRecord = {
    playerExternalId: value.playerExternalId,
    status: value.status,
    at: value.at,
  };
  if ("rows" in value && typeof value.rows === "number") {
    record.rows = value.rows;
  }
  if ("reason" in value && typeof value.reason === "string") {
    record.reason = value.reason;
  }
  return record;
}

export function jerseyCheckpointPath(planId: string, stateDir = resolveBulkStateDir()): string {
  return path.join(stateDir, `${planId}.jsonl`);
}

/**
 * Append-only JSONL, one line per finished player, last line wins.
 *
 * Same shape as the bulk checkpoint but keyed by player rather than by task, so a run torn
 * down mid-backfill resumes at the next player instead of replaying thousands of pages.
 */
export function createJsonlJerseyCheckpoint(filePath: string): JerseyCheckpoint {
  let directoryReady = false;

  return {
    async read() {
      let contents: string;
      try {
        contents = await readFile(filePath, "utf8");
      } catch {
        return [];
      }
      const records: JerseyCheckpointRecord[] = [];
      for (const line of contents.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        try {
          // A kill mid-write can tear the last line; a torn line is not a state transition.
          const record = parseJerseyCheckpointRecord(JSON.parse(trimmed));
          if (record) {
            records.push(record);
          }
        } catch {}
      }
      return records;
    },

    async append(record) {
      if (!directoryReady) {
        await mkdir(path.dirname(filePath), { recursive: true });
        directoryReady = true;
      }
      await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
    },
  };
}

export function createInMemoryJerseyCheckpoint(
  seed: JerseyCheckpointRecord[] = [],
): JerseyCheckpoint & { records: JerseyCheckpointRecord[] } {
  const records = [...seed];
  return {
    records,
    async read() {
      return [...records];
    },
    async append(record) {
      records.push(record);
    },
  };
}

export interface RunJerseyNumbersOptions {
  playerExternalIds: readonly string[];
  fetcher: JerseyNumbersFetcher;
  /** Injected so backfill and single-player runs share one pool. */
  db: Db;
  checkpoint?: JerseyCheckpoint;
  progress?: (line: string) => void;
  /** Log a progress line every N players. */
  progressEvery?: number;
  /**
   * Players fetched at once. Defaults to 1.
   *
   * Site Unblocker spends five to six seconds per page, so a serial walk of the whole lane
   * is a ten-hour run that is idle almost all of it. Raising this widens only our own
   * in-flight window — the transport keeps its own pacing, retry, and circuit — and Decodo's
   * edge advertises a 200/s limit, so a handful of workers is nowhere near it.
   */
  concurrency?: number;
}

/** Walk a list of players, persisting each one's career squad-number history. */
export async function runJerseyNumbers(
  options: RunJerseyNumbersOptions,
): Promise<JerseyNumbersSummary> {
  const progress = options.progress ?? seedProgress;
  const progressEvery = options.progressEvery ?? 25;
  const summary = emptySummary();

  const done = new Set<string>();
  if (options.checkpoint) {
    const lastByPlayer = new Map<string, JerseyCheckpointRecord>();
    for (const record of await options.checkpoint.read()) {
      lastByPlayer.set(record.playerExternalId, record);
    }
    for (const [playerExternalId, record] of lastByPlayer) {
      if (record.status === "done") {
        done.add(playerExternalId);
      }
    }
  }

  const pending = options.playerExternalIds.filter((playerExternalId) => {
    if (!done.has(playerExternalId)) {
      return true;
    }
    summary.resumed += 1;
    return false;
  });

  const total = pending.length;
  progress(`jersey players=${total} already-done=${summary.resumed}`);

  let cursor = 0;
  let finished = 0;
  let stop = false;

  /**
   * One player, start to finish.
   *
   * A failed player is recorded and the walk continues — one 404 or one WAF miss must not
   * cost the rest of a multi-hour backfill. Only a tripped circuit sets `stop`, and workers
   * then drain rather than being cancelled, so no player is left half-written.
   */
  async function processOne(playerExternalId: string): Promise<void> {
    summary.players += 1;
    try {
      const raw = await options.fetcher.fetchPlayerJerseyNumbers(playerExternalId);
      const mapped = await mapPlayerJerseyNumbers(options.db, normalizePlayerJerseyNumbers(raw));
      addMapResult(summary, mapped);

      if (!mapped.playerFound) {
        summary.playersMissing += 1;
      } else if (mapped.parsedRows === 0) {
        summary.playersEmpty += 1;
      } else {
        summary.playersWithHistory += 1;
      }

      await options.checkpoint?.append({
        playerExternalId,
        status: "done",
        at: new Date().toISOString(),
        rows: mapped.parsedRows,
      });
    } catch (error: unknown) {
      const reason = describeSeedError(error);
      summary.failures.push({ playerExternalId, error: reason });
      await options.checkpoint?.append({
        playerExternalId,
        status: "failed",
        at: new Date().toISOString(),
        reason,
      });
      progress(`jersey player ${playerExternalId} failed ${reason}`);

      if (error instanceof TransfermarktCircuitOpenError) {
        stop = true;
        summary.stopped = "circuit_open";
        progress("jersey stopped circuit_open");
      }
    }

    finished += 1;
    if (finished % progressEvery === 0) {
      progress(
        `jersey ${finished}/${total} created=${summary.created} empty=${summary.playersEmpty} failed=${summary.failures.length}`,
      );
    }
  }

  async function worker(): Promise<void> {
    while (!stop) {
      const next = pending[cursor];
      cursor += 1;
      if (next === undefined) {
        return;
      }
      await processOne(next);
    }
  }

  const workers = Math.max(1, Math.min(options.concurrency ?? 1, total || 1));
  await Promise.all(Array.from({ length: workers }, () => worker()));

  return summary;
}

/** Every Transfermarkt player id the lane already holds a `player` row for. */
export async function listLanePlayerExternalIds(db: Db): Promise<string[]> {
  const rows = await db
    .select({ value: externalId.value })
    .from(externalId)
    .where(and(eq(externalId.entityType, "player"), eq(externalId.system, TM_SYSTEM)))
    .orderBy(asc(externalId.value));
  return rows.map((row) => row.value);
}

export interface RunJerseyNumbersCliOptions {
  /** Explicit player ids, or `undefined` for the whole-lane backfill. */
  playerExternalIds?: readonly string[];
  lane: Lane;
  fetcher: JerseyNumbersFetcher;
  databaseUrl?: string;
  stateDir?: string;
  progressEvery?: number;
  concurrency?: number;
}

export const DEFAULT_JERSEY_CONCURRENCY = 1;

/** `SEED_JERSEY_CONCURRENCY`, clamped so a typo cannot open an unbounded fan-out. */
export function resolveJerseyConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SEED_JERSEY_CONCURRENCY?.trim();
  if (!raw) {
    return DEFAULT_JERSEY_CONCURRENCY;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_JERSEY_CONCURRENCY;
  }
  return Math.min(parsed, 8);
}

export interface JerseyNumbersCliResult {
  lane: Lane;
  mode: "players" | "backfill";
  checkpointFile?: string;
  summary: JerseyNumbersSummary;
}

export async function runJerseyNumbersFromCli(
  options: RunJerseyNumbersCliOptions,
): Promise<JerseyNumbersCliResult> {
  const lane = parseLane(options.lane);
  const databaseUrl = options.databaseUrl ?? resolveDatabaseUrl(lane);
  // The default pool holds ten connections, so `concurrency` is capped below that.
  const concurrency = options.concurrency ?? resolveJerseyConcurrency();
  const { db, pool } = createDb(databaseUrl, SEED_CREATE_DB_OPTIONS);

  try {
    if (options.playerExternalIds?.length) {
      const summary = await runJerseyNumbers({
        playerExternalIds: options.playerExternalIds,
        fetcher: options.fetcher,
        db,
        progressEvery: options.progressEvery,
        concurrency,
      });
      return { lane, mode: "players", summary };
    }

    const playerExternalIds = await listLanePlayerExternalIds(db);
    const checkpointFile = jerseyCheckpointPath(JERSEY_BACKFILL_PLAN_ID, options.stateDir);
    const summary = await runJerseyNumbers({
      playerExternalIds,
      fetcher: options.fetcher,
      db,
      checkpoint: createJsonlJerseyCheckpoint(checkpointFile),
      progressEvery: options.progressEvery,
      concurrency,
    });
    return { lane, mode: "backfill", checkpointFile, summary };
  } finally {
    await pool.end();
  }
}
