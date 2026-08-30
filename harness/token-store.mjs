/**
 * Append-only SQLite store for coding-job token runs (issue + session + cost).
 * Uses Node's built-in `node:sqlite` (no native addon). Fail open on write errors.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isFiniteTokenCount } from "./token-cost.mjs";

export const DEFAULT_TOKEN_DB_PATH = "/var/lib/kit-pi/token-runs.sqlite";

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function resolveTokenDbPath(env = process.env) {
  const raw = env.KIT_TOKEN_DB_PATH;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  return DEFAULT_TOKEN_DB_PATH;
}

/**
 * @param {string} dbPath
 */
function ensureParentDir(dbPath) {
  if (dbPath === ":memory:" || dbPath.startsWith("file:")) {
    return;
  }
  mkdirSync(dirname(dbPath), { recursive: true });
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 */
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ended_at TEXT NOT NULL,
      started_at TEXT,
      identifier TEXT NOT NULL,
      issue_id TEXT,
      role TEXT NOT NULL,
      session_id TEXT,
      cost_usd REAL,
      cost_estimate INTEGER NOT NULL DEFAULT 1,
      tokens_in INTEGER,
      tokens_out INTEGER,
      lines_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_token_runs_identifier ON token_runs(identifier);
    CREATE INDEX IF NOT EXISTS idx_token_runs_ended_at ON token_runs(ended_at);
    CREATE INDEX IF NOT EXISTS idx_token_runs_session ON token_runs(session_id);
  `);
}

/**
 * @param {{
 *   dbPath?: string,
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 * }} [options]
 */
export function createTokenStore(options = {}) {
  const env = options.env ?? process.env;
  const dbPath = options.dbPath ?? resolveTokenDbPath(env);
  ensureParentDir(dbPath);
  const db = new DatabaseSync(dbPath);
  migrate(db);

  const insert = db.prepare(`
    INSERT INTO token_runs (
      ended_at, started_at, identifier, issue_id, role, session_id,
      cost_usd, cost_estimate, tokens_in, tokens_out, lines_json
    ) VALUES (
      @ended_at, @started_at, @identifier, @issue_id, @role, @session_id,
      @cost_usd, @cost_estimate, @tokens_in, @tokens_out, @lines_json
    )
  `);

  const selectByIdentifier = db.prepare(`
    SELECT * FROM token_runs
    WHERE identifier = ?
    ORDER BY id DESC
    LIMIT ?
  `);

  const selectRecent = db.prepare(`
    SELECT * FROM token_runs
    ORDER BY id DESC
    LIMIT ?
  `);

  const sumByIdentifier = db.prepare(`
    SELECT
      COUNT(*) AS run_count,
      SUM(cost_usd) AS cost_usd,
      SUM(tokens_in) AS tokens_in,
      SUM(tokens_out) AS tokens_out
    FROM token_runs
    WHERE identifier = ?
  `);

  return {
    dbPath,

    /**
     * @param {{
     *   role: string,
     *   identifier: string,
     *   issueId?: string,
     *   sessionId?: string,
     *   startedAt?: string,
     *   endedAt?: string,
     *   costUsd?: number | null,
     *   costEstimate?: boolean,
     *   lines?: Array<{
     *     role?: string,
     *     model?: string,
     *     modelId?: string,
     *     input?: number | "unknown",
     *     output?: number | "unknown",
     *     costUsd?: number | null,
     *     costEstimate?: boolean,
     *   }>,
     * }} tokens
     * @returns {{ id: number } | null}
     */
    recordTokenRun(tokens) {
      if (!tokens || typeof tokens !== "object") {
        return null;
      }
      if (typeof tokens.identifier !== "string" || tokens.identifier.length === 0) {
        return null;
      }
      if (typeof tokens.role !== "string" || tokens.role.length === 0) {
        return null;
      }
      const lines = Array.isArray(tokens.lines) ? tokens.lines : [];
      const tokensIn = lines.reduce(
        (sum, line) => sum + (isFiniteTokenCount(line.input) ? line.input : 0),
        0,
      );
      const tokensOut = lines.reduce(
        (sum, line) => sum + (isFiniteTokenCount(line.output) ? line.output : 0),
        0,
      );
      const anyReported = lines.some((line) => line.costEstimate === false);
      const costEstimate =
        typeof tokens.costEstimate === "boolean"
          ? tokens.costEstimate
          : !anyReported;
      try {
        const result = insert.run({
          ended_at: tokens.endedAt ?? new Date().toISOString(),
          started_at: typeof tokens.startedAt === "string" ? tokens.startedAt : null,
          identifier: tokens.identifier,
          issue_id: typeof tokens.issueId === "string" ? tokens.issueId : null,
          role: tokens.role,
          session_id: typeof tokens.sessionId === "string" ? tokens.sessionId : null,
          cost_usd: typeof tokens.costUsd === "number" ? tokens.costUsd : null,
          cost_estimate: costEstimate ? 1 : 0,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          lines_json: JSON.stringify(lines),
        });
        return { id: Number(result.lastInsertRowid) };
      } catch {
        return null;
      }
    },

    /**
     * @param {string} identifier
     * @param {number} [limit]
     */
    listByIdentifier(identifier, limit = 50) {
      return selectByIdentifier.all(identifier, Math.max(1, Math.min(limit, 500))).map(mapRow);
    },

    /**
     * @param {number} [limit]
     */
    listRecent(limit = 50) {
      return selectRecent.all(Math.max(1, Math.min(limit, 500))).map(mapRow);
    },

    /**
     * @param {string} identifier
     */
    summarizeIdentifier(identifier) {
      const row = /** @type {Record<string, unknown>} */ (sumByIdentifier.get(identifier) ?? {});
      return {
        identifier,
        runCount: Number(row.run_count ?? 0),
        costUsd:
          typeof row.cost_usd === "number" && Number.isFinite(row.cost_usd)
            ? Number(row.cost_usd.toFixed(6))
            : null,
        tokensIn: Number(row.tokens_in ?? 0),
        tokensOut: Number(row.tokens_out ?? 0),
      };
    },

    close() {
      db.close();
    },
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function mapRow(row) {
  let lines = [];
  try {
    lines = JSON.parse(typeof row.lines_json === "string" ? row.lines_json : "[]");
  } catch {
    lines = [];
  }
  return {
    id: Number(row.id),
    endedAt: row.ended_at,
    startedAt: row.started_at ?? undefined,
    identifier: row.identifier,
    issueId: row.issue_id ?? undefined,
    role: row.role,
    sessionId: row.session_id ?? undefined,
    costUsd: typeof row.cost_usd === "number" ? row.cost_usd : null,
    costEstimate: row.cost_estimate === 1 || row.cost_estimate === true,
    tokensIn: Number(row.tokens_in ?? 0),
    tokensOut: Number(row.tokens_out ?? 0),
    lines: Array.isArray(lines) ? lines : [],
  };
}

/** @type {ReturnType<typeof createTokenStore> | null} */
let defaultStore = null;

/**
 * Lazy process-wide store. Missing/unwritable path returns null (fail open).
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function getDefaultTokenStore(env = process.env) {
  if (env.KIT_TOKEN_DB_PATH === "off" || env.KIT_TOKEN_DB_PATH === "0") {
    return null;
  }
  if (defaultStore) {
    return defaultStore;
  }
  try {
    defaultStore = createTokenStore({ env });
    return defaultStore;
  } catch {
    return null;
  }
}

/**
 * @param {ReturnType<typeof createTokenStore> | null} store
 */
export function setDefaultTokenStoreForTests(store) {
  defaultStore = store;
}
