// The scheduler's ledger: one row per workflow run it started for an issue.
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { IssueHistory } from "./board.js";

/**
 * active: the run is going. handed-over: it ended and the issue left the
 * working states. stalled: it ended and the issue did not move on.
 * released: a stall that a person or the orchestrator cleared.
 */
export type DispatchStatus = "active" | "handed-over" | "stalled" | "released";

export interface Dispatch {
  id: string;
  issue: string;
  machineId: string;
  threadId: string | null;
  resume: boolean;
  status: DispatchStatus;
  outcome: string | null;
  startedAt: number;
  endedAt: number | null;
}

/** Appended to the run ledger's migrations; never reorder. */
export const DISPATCH_MIGRATIONS = [
  `CREATE TABLE dispatches (
     id TEXT PRIMARY KEY,
     issue TEXT NOT NULL,
     machine_id TEXT NOT NULL,
     thread_id TEXT,
     resume INTEGER NOT NULL,
     status TEXT NOT NULL,
     outcome TEXT,
     started_at INTEGER NOT NULL,
     ended_at INTEGER
   )`,
  `CREATE INDEX dispatches_issue ON dispatches (issue, started_at)`,
];

interface Row {
  id: string;
  issue: string;
  machine_id: string;
  thread_id: string | null;
  resume: number;
  status: DispatchStatus;
  outcome: string | null;
  started_at: number;
  ended_at: number | null;
}

const toDispatch = (row: Row): Dispatch => ({
  id: row.id,
  issue: row.issue,
  machineId: row.machine_id,
  threadId: row.thread_id,
  resume: row.resume === 1,
  status: row.status,
  outcome: row.outcome,
  startedAt: row.started_at,
  endedAt: row.ended_at,
});

export function createDispatchStore(db: Database) {
  const forIssue = (issue: string) =>
    // SAFETY: the query reads a table this store's own migrations create; the row type mirrors its columns.
    (
      db
        .prepare(`SELECT * FROM dispatches WHERE issue = ? ORDER BY started_at DESC, rowid DESC`)
        .all(issue) as Row[]
    ).map(toDispatch);

  return {
    start(input: { issue: string; machineId: string; resume: boolean; now: number }): Dispatch {
      const id = `dsp_${randomUUID().slice(0, 12)}`;
      db.prepare(
        `INSERT INTO dispatches (id, issue, machine_id, resume, status, started_at) VALUES (?, ?, ?, ?, 'active', ?)`,
      ).run(id, input.issue, input.machineId, input.resume ? 1 : 0, input.now);
      return {
        id,
        issue: input.issue,
        machineId: input.machineId,
        threadId: null,
        resume: input.resume,
        status: "active",
        outcome: null,
        startedAt: input.now,
        endedAt: null,
      };
    },
    attach(id: string, threadId: string): void {
      db.prepare(`UPDATE dispatches SET thread_id = ? WHERE id = ?`).run(threadId, id);
    },
    end(id: string, status: "handed-over" | "stalled", outcome: string | null, now: number): void {
      db.prepare(
        `UPDATE dispatches SET status = ?, outcome = ?, ended_at = ? WHERE id = ? AND status = 'active'`,
      ).run(status, outcome, now, id);
    },
    /** Lifts a stall so the issue is planned again. Returns false when there was none. */
    release(issue: string): boolean {
      return (
        db
          .prepare(
            `UPDATE dispatches SET status = 'released' WHERE issue = ? AND status = 'stalled'`,
          )
          .run(issue).changes > 0
      );
    },
    active(): Dispatch[] {
      // SAFETY: the query reads a table this store's own migrations create; the row type mirrors its columns.
      return (db.prepare(`SELECT * FROM dispatches WHERE status = 'active'`).all() as Row[]).map(
        toDispatch,
      );
    },
    latest: (issue: string): Dispatch | null => forIssue(issue)[0] ?? null,
    /** Runs in a row, newest first, that ended stalled. */
    consecutiveStalls(issue: string): number {
      const rows = forIssue(issue);
      const firstOther = rows.findIndex((row) => row.status !== "stalled");
      return firstOther === -1 ? rows.length : firstOther;
    },
    history(): Map<string, IssueHistory> {
      const history = new Map<string, IssueHistory>();
      // SAFETY: the query reads a table this store's own migrations create; the row type mirrors its columns.
      const rows = db
        .prepare(`SELECT * FROM dispatches ORDER BY started_at ASC, rowid ASC`)
        .all() as Row[];
      for (const row of rows) {
        // Rows arrive oldest first, so the last one written per issue is its latest run.
        history.set(row.issue, {
          activeOn: row.status === "active" ? row.machine_id : null,
          stalled: row.status === "stalled",
          startedBefore: true,
        });
      }
      return history;
    },
    list(limit: number): Dispatch[] {
      return (
        // SAFETY: the query reads a table this store's own migrations create; the row type mirrors its columns.
        (
          db
            .prepare(`SELECT * FROM dispatches ORDER BY started_at DESC, rowid DESC LIMIT ?`)
            .all(limit) as Row[]
        ).map(toDispatch)
      );
    },
  };
}
export type DispatchStore = ReturnType<typeof createDispatchStore>;
