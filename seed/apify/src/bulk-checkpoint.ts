import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { BulkCheckpoint, BulkRecord, BulkTask, BulkTaskKind, BulkTaskStatus } from "./bulk.js";

export const DEFAULT_SEED_BULK_STATE_DIR = ".seed-state";

export function resolveBulkStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.SEED_BULK_STATE_DIR?.trim() || DEFAULT_SEED_BULK_STATE_DIR;
}

export function bulkCheckpointPath(planId: string, stateDir = resolveBulkStateDir()): string {
  return path.join(stateDir, `${planId}.jsonl`);
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function isBulkTaskKind(value: unknown): value is BulkTaskKind {
  return (
    value === "league" || value === "league_season" || value === "club" || value === "club_season"
  );
}

function isBulkTaskStatus(value: unknown): value is BulkTaskStatus {
  return value === "pending" || value === "done" || value === "failed" || value === "skipped";
}

function parseBulkTask(value: unknown): BulkTask | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  if (!("id" in value) || typeof value.id !== "string") {
    return undefined;
  }
  if (!("kind" in value) || !isBulkTaskKind(value.kind)) {
    return undefined;
  }
  if (!("competition" in value) || typeof value.competition !== "string") {
    return undefined;
  }
  const task: BulkTask = {
    id: value.id,
    kind: value.kind,
    competition: value.competition,
  };
  if ("season" in value && typeof value.season === "string") {
    task.season = value.season;
  }
  if ("clubExternalId" in value && typeof value.clubExternalId === "string") {
    task.clubExternalId = value.clubExternalId;
  }
  return task;
}

function parseBulkRecord(value: unknown): BulkRecord | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  if (!("taskId" in value) || typeof value.taskId !== "string") {
    return undefined;
  }
  if (!("kind" in value) || !isBulkTaskKind(value.kind)) {
    return undefined;
  }
  if (!("status" in value) || !isBulkTaskStatus(value.status)) {
    return undefined;
  }
  if (!("at" in value) || typeof value.at !== "string") {
    return undefined;
  }
  const record: BulkRecord = {
    taskId: value.taskId,
    kind: value.kind,
    status: value.status,
    at: value.at,
  };
  if ("reason" in value && typeof value.reason === "string") {
    record.reason = value.reason;
  }
  if ("task" in value) {
    const task = parseBulkTask(value.task);
    if (task) {
      record.task = task;
    }
  }
  return record;
}

export function parseBulkRecords(contents: string): BulkRecord[] {
  const records: BulkRecord[] = [];
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      // A crash can truncate the last line mid-write; a torn line is not a state transition.
      const record = parseBulkRecord(JSON.parse(trimmed));
      if (record) {
        records.push(record);
      }
    } catch {}
  }
  return records;
}

/** Append-only JSONL: one line per state transition, last line wins per task id. */
export function createJsonlBulkCheckpoint(filePath: string): BulkCheckpoint & { file: string } {
  let directoryReady = false;

  return {
    file: filePath,
    async read() {
      try {
        return parseBulkRecords(await readFile(filePath, "utf8"));
      } catch (error: unknown) {
        if (isMissingFileError(error)) {
          return [];
        }
        throw error;
      }
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

export function createInMemoryBulkCheckpoint(
  seed: BulkRecord[] = [],
): BulkCheckpoint & { records: BulkRecord[] } {
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
