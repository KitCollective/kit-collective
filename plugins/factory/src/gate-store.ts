// The record of gate runs: one row per `optio_gate` call, whether it ran, was refused or failed.
import type { Database } from "better-sqlite3";

/**
 * Appended after the Loop migrations, which development ships it after, so a
 * database that already ran it keeps its indexes (RUN_MIGRATIONS follow it).
 * The lists run as one sequence and an insert in the middle would move the
 * ones after it.
 */
export const GATE_MIGRATIONS = [
  `CREATE TABLE gate_runs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     at INTEGER NOT NULL,
     thread_id TEXT NOT NULL,
     gate TEXT NOT NULL,
     pr TEXT,
     issue TEXT,
     outcome TEXT NOT NULL,
     exit_code INTEGER,
     verdict_line TEXT,
     sha TEXT,
     host_id TEXT,
     reason TEXT
   )`,
  `CREATE INDEX gate_runs_thread ON gate_runs (thread_id, id)`,
];

/**
 * ran: the gate script ran and exited (its exit code says open or closed).
 * refused: the gate or an argument failed validation; nothing was run.
 * error: the script could not be run (no environment, host failure).
 */
export type GateOutcome = "ran" | "refused" | "error";

export interface GateRun {
  id: number;
  at: number;
  threadId: string;
  /** What the caller asked for, verbatim when it was refused. */
  gate: string;
  pr: string | number | null;
  issue: string | null;
  outcome: GateOutcome;
  exitCode: number | null;
  verdictLine: string | null;
  sha: string | null;
  hostId: string | null;
  reason: string | null;
}

interface Row {
  id: number;
  at: number;
  thread_id: string;
  gate: string;
  pr: string | null;
  issue: string | null;
  outcome: GateOutcome;
  exit_code: number | null;
  verdict_line: string | null;
  sha: string | null;
  host_id: string | null;
  reason: string | null;
}

const toGateRun = (row: Row): GateRun => ({
  id: row.id,
  at: row.at,
  threadId: row.thread_id,
  gate: row.gate,
  // A PR the caller sent as a number is stored as text, so a refused "1;rm" and a valid 12 share a column.
  pr: row.pr === null ? null : /^[0-9]+$/.test(row.pr) ? Number(row.pr) : row.pr,
  issue: row.issue,
  outcome: row.outcome,
  exitCode: row.exit_code,
  verdictLine: row.verdict_line,
  sha: row.sha,
  hostId: row.host_id,
  reason: row.reason,
});

export type GateRunInput = Omit<GateRun, "id">;

export function createGateStore(db: Database) {
  return {
    record(input: GateRunInput): GateRun {
      const result = db
        .prepare(
          `INSERT INTO gate_runs (at, thread_id, gate, pr, issue, outcome, exit_code, verdict_line, sha, host_id, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.at,
          input.threadId,
          input.gate,
          input.pr === null ? null : String(input.pr),
          input.issue,
          input.outcome,
          input.exitCode,
          input.verdictLine,
          input.sha,
          input.hostId,
          input.reason,
        );
      return { id: Number(result.lastInsertRowid), ...input };
    },
    /** Newest first. */
    list(limit: number): GateRun[] {
      // SAFETY: the query reads a table this store's own migrations create; the row type mirrors its columns.
      return (
        db.prepare(`SELECT * FROM gate_runs ORDER BY id DESC LIMIT ?`).all(limit) as Row[]
      ).map(toGateRun);
    },
  };
}
