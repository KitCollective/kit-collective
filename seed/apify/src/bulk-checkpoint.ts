import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { BulkCheckpoint, BulkRecord } from "./bulk.js";

export const DEFAULT_SEED_BULK_STATE_DIR = ".seed-state";

export function resolveBulkStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.SEED_BULK_STATE_DIR?.trim() || DEFAULT_SEED_BULK_STATE_DIR;
}

export function bulkCheckpointPath(planId: string, stateDir = resolveBulkStateDir()): string {
  return path.join(stateDir, `${planId}.jsonl`);
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT",
  );
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
      records.push(JSON.parse(trimmed) as BulkRecord);
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
