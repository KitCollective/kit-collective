// Operating settings: values a person overrides in Optio instead of in the repo's files. One
// override per (subject, key), who set it and when, and an append-only log of every change. The
// store knows nothing of what a subject is: the Loops area uses `loop:<name>`, and the Staff area
// can use its own subjects. Values are JSON; a cleared override is no row, and an override of
// `null` is a value like any other.
import type Database from "better-sqlite3";

/**
 * The tables are created in place rather than appended to the plugin's ordered migration list,
 * which belongs to src/core.ts and is positional: a second list on the same database would reuse
 * ids that list has already recorded.
 */
const CREATE = [
  `CREATE TABLE IF NOT EXISTS operating_settings (
     subject TEXT NOT NULL,
     key TEXT NOT NULL,
     value_json TEXT NOT NULL,
     changed_by TEXT NOT NULL,
     changed_at INTEGER NOT NULL,
     PRIMARY KEY (subject, key)
   )`,
  `CREATE TABLE IF NOT EXISTS operating_setting_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     subject TEXT NOT NULL,
     key TEXT NOT NULL,
     from_json TEXT,
     to_json TEXT,
     changed_by TEXT NOT NULL,
     changed_at INTEGER NOT NULL
   )`,
];

export interface Override {
  value: unknown;
  by: string;
  /** Epoch ms. */
  at: number;
}

export interface Change {
  subject: string;
  key: string;
  /** The override before the change; undefined when the file's value was in force. */
  from: { value: unknown } | undefined;
  /** The override after the change; undefined when it was cleared. */
  to: { value: unknown } | undefined;
  by: string;
  at: number;
}

interface OverrideRow {
  subject: string;
  key: string;
  value_json: string;
  changed_by: string;
  changed_at: number;
}

interface LogRow {
  subject: string;
  key: string;
  from_json: string | null;
  to_json: string | null;
  changed_by: string;
  changed_at: number;
}

const wrap = (json: string | null) => (json === null ? undefined : { value: JSON.parse(json) });

export function createSettingsStore(db: Database.Database) {
  for (const statement of CREATE) db.exec(statement);
  const read = db.prepare("SELECT * FROM operating_settings WHERE subject = ? AND key = ?");
  const upsert = db.prepare(
    `INSERT INTO operating_settings (subject, key, value_json, changed_by, changed_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (subject, key) DO UPDATE SET
       value_json = excluded.value_json, changed_by = excluded.changed_by, changed_at = excluded.changed_at`,
  );
  const remove = db.prepare("DELETE FROM operating_settings WHERE subject = ? AND key = ?");
  const append = db.prepare(
    `INSERT INTO operating_setting_log (subject, key, from_json, to_json, changed_by, changed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  /** Writes the new override (or clears it) and logs the change; false when nothing changes. */
  const change = db.transaction(
    (subject: string, key: string, next: unknown | undefined, by: string, at: number): boolean => {
      // SAFETY: `read` selects every column of operating_settings, which OverrideRow mirrors.
      const before = read.get(subject, key) as OverrideRow | undefined;
      const to = next === undefined ? null : JSON.stringify(next);
      if ((before?.value_json ?? null) === to) return false;
      if (to === null) remove.run(subject, key);
      else upsert.run(subject, key, to, by, at);
      append.run(subject, key, before?.value_json ?? null, to, by, at);
      return true;
    },
  );

  return {
    /** The overrides of every subject whose name starts with `prefix`, by subject then key. */
    overrides(prefix: string): Map<string, Map<string, Override>> {
      // SAFETY: the query selects every column of operating_settings, which OverrideRow mirrors.
      const rows = db
        .prepare("SELECT * FROM operating_settings WHERE substr(subject, 1, ?) = ?")
        .all(prefix.length, prefix) as OverrideRow[];
      const bySubject = new Map<string, Map<string, Override>>();
      for (const row of rows) {
        const own = bySubject.get(row.subject) ?? new Map<string, Override>();
        own.set(row.key, {
          value: JSON.parse(row.value_json),
          by: row.changed_by,
          at: row.changed_at,
        });
        bySubject.set(row.subject, own);
      }
      return bySubject;
    },
    set: (subject: string, key: string, value: unknown, by: string, at: number) =>
      change(subject, key, value === undefined ? null : value, by, at),
    clear: (subject: string, key: string, by: string, at: number) =>
      change(subject, key, undefined, by, at),
    /** The newest changes of the subjects starting with `prefix`, newest first. */
    log(prefix: string, limit: number): Change[] {
      // SAFETY: the query selects every column of operating_setting_log, which LogRow mirrors.
      const rows = db
        .prepare(
          "SELECT * FROM operating_setting_log WHERE substr(subject, 1, ?) = ? ORDER BY id DESC LIMIT ?",
        )
        .all(prefix.length, prefix, limit) as LogRow[];
      return rows.map((row) => ({
        subject: row.subject,
        key: row.key,
        from: wrap(row.from_json),
        to: wrap(row.to_json),
        by: row.changed_by,
        at: row.changed_at,
      }));
    },
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
