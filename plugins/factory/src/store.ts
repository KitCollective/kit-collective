// The run ledger: one row per event an agent was asked to handle.
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";

export type RunStatus = "starting" | "running" | "done" | "failed" | "skipped";
export type EventSource = "chat" | "automation" | "http" | "manual" | "follow-up" | "linear";

export interface Run {
  id: string;
  agentId: string;
  source: EventSource;
  deliveryId: string | null;
  concurrencyKey: string | null;
  status: RunStatus;
  reason: string | null;
  threadId: string | null;
  createdAt: number;
  finishedAt: number | null;
}

/** Append-only: statement index is the migration id. */
export const MIGRATIONS = [
  `CREATE TABLE runs (
     id TEXT PRIMARY KEY,
     agent_id TEXT NOT NULL,
     source TEXT NOT NULL,
     delivery_id TEXT,
     concurrency_key TEXT,
     status TEXT NOT NULL,
     reason TEXT,
     thread_id TEXT,
     created_at INTEGER NOT NULL,
     finished_at INTEGER
   )`,
  `CREATE UNIQUE INDEX runs_delivery ON runs (agent_id, source, delivery_id)
     WHERE delivery_id IS NOT NULL`,
  `CREATE INDEX runs_thread ON runs (thread_id)`,
  `CREATE INDEX runs_created ON runs (created_at)`,
];

interface Row {
  id: string;
  agent_id: string;
  source: EventSource;
  delivery_id: string | null;
  concurrency_key: string | null;
  status: RunStatus;
  reason: string | null;
  thread_id: string | null;
  created_at: number;
  finished_at: number | null;
}

function toRun(row: Row): Run {
  return {
    id: row.id,
    agentId: row.agent_id,
    source: row.source,
    deliveryId: row.delivery_id,
    concurrencyKey: row.concurrency_key,
    status: row.status,
    reason: row.reason,
    threadId: row.thread_id,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

const ACTIVE = `status IN ('starting', 'running')`;

export function createRunStore(db: Database) {
  return {
    /** Records a run. Returns null when this agent already saw the delivery. */
    insert(run: Omit<Run, "id" | "threadId" | "finishedAt">): Run | null {
      const id = `run_${randomUUID().slice(0, 12)}`;
      const finishedAt = run.status === "skipped" ? run.createdAt : null;
      const result = db
        .prepare(
          `INSERT OR IGNORE INTO runs
             (id, agent_id, source, delivery_id, concurrency_key, status, reason, created_at, finished_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          run.agentId,
          run.source,
          run.deliveryId,
          run.concurrencyKey,
          run.status,
          run.reason,
          run.createdAt,
          finishedAt,
        );
      return result.changes === 0 ? null : { ...run, id, threadId: null, finishedAt };
    },
    hasDelivery(agentId: string, source: EventSource, deliveryId: string): boolean {
      return (
        db
          .prepare(`SELECT 1 FROM runs WHERE agent_id = ? AND source = ? AND delivery_id = ?`)
          .get(agentId, source, deliveryId) !== undefined
      );
    },
    active(agentId: string, concurrencyKey: string): Run[] {
      return (
        db
          .prepare(`SELECT * FROM runs WHERE agent_id = ? AND concurrency_key = ? AND ${ACTIVE}`)
          .all(agentId, concurrencyKey) as Row[]
      ).map(toRun);
    },
    /** When this agent last started a run for the key, skipped events excluded. */
    lastStartedAt(agentId: string, concurrencyKey: string): number | null {
      const row = db
        .prepare(
          `SELECT MAX(created_at) AS at FROM runs
           WHERE agent_id = ? AND concurrency_key = ? AND status != 'skipped'`,
        )
        .get(agentId, concurrencyKey) as { at: number | null };
      return row.at;
    },
    started(id: string, threadId: string): void {
      db.prepare(`UPDATE runs SET status = 'running', thread_id = ? WHERE id = ?`).run(threadId, id);
    },
    finish(id: string, status: "done" | "failed", reason: string | null, now: number): void {
      db.prepare(
        `UPDATE runs SET status = ?, reason = ?, finished_at = ? WHERE id = ? AND ${ACTIVE}`,
      ).run(status, reason, now, id);
    },
    finishByThread(
      threadId: string,
      status: "done" | "failed",
      reason: string | null,
      now: number,
    ): void {
      db.prepare(
        `UPDATE runs SET status = ?, reason = ?, finished_at = ? WHERE thread_id = ? AND ${ACTIVE}`,
      ).run(status, reason, now, threadId);
    },
    /** A `starting` row left by a server stop never got its thread. */
    failInterrupted(now: number): void {
      db.prepare(
        `UPDATE runs SET status = 'failed', reason = 'interrupted before the thread started', finished_at = ?
         WHERE status = 'starting'`,
      ).run(now);
    },
    list(limit: number, agentId?: string): Run[] {
      const rows =
        agentId === undefined
          ? db.prepare(`SELECT * FROM runs ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(limit)
          : db
              .prepare(
                `SELECT * FROM runs WHERE agent_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
              )
              .all(agentId, limit);
      return (rows as Row[]).map(toRun);
    },
  };
}
export type RunStore = ReturnType<typeof createRunStore>;
