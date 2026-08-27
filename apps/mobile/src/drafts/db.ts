import { openDatabaseSync } from "expo-sqlite";

export const draftDb = openDatabaseSync("kit_drafts.db");

draftDb.execSync(`
  CREATE TABLE IF NOT EXISTS jersey_draft (
    id TEXT PRIMARY KEY NOT NULL,
    club_id TEXT,
    club_label TEXT,
    season_id TEXT,
    kit_type TEXT NOT NULL DEFAULT 'home',
    size TEXT NOT NULL DEFAULT 'm',
    condition TEXT NOT NULL DEFAULT 'used',
    active_role TEXT,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS jersey_draft_photo (
    draft_id TEXT NOT NULL,
    role TEXT NOT NULL,
    uri TEXT NOT NULL,
    source TEXT NOT NULL,
    PRIMARY KEY (draft_id, role),
    FOREIGN KEY (draft_id) REFERENCES jersey_draft(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS capture_session (
    id TEXT PRIMARY KEY NOT NULL,
    branch TEXT NOT NULL,
    active_draft_id TEXT NOT NULL,
    ordered_uris_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS capture_unbound_photo (
    session_id TEXT NOT NULL,
    uri TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    PRIMARY KEY (session_id, uri),
    FOREIGN KEY (session_id) REFERENCES capture_session(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS capture_session_draft (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    club_id TEXT,
    club_label TEXT,
    season_id TEXT,
    kit_type TEXT,
    size TEXT,
    condition TEXT,
    kit_type_selected INTEGER NOT NULL DEFAULT 0,
    size_selected INTEGER NOT NULL DEFAULT 0,
    condition_selected INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES capture_session(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS capture_session_draft_photo (
    session_id TEXT NOT NULL,
    draft_id TEXT NOT NULL,
    uri TEXT NOT NULL,
    role TEXT,
    source TEXT NOT NULL DEFAULT 'gallery',
    PRIMARY KEY (draft_id, uri),
    FOREIGN KEY (draft_id) REFERENCES capture_session_draft(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES capture_session(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS app_kv (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`);

function ensureColumn(table: string, column: string, definition: string): void {
  const columns = draftDb.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((entry) => entry.name === column)) {
    draftDb.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("capture_session_draft", "notes", "TEXT NOT NULL DEFAULT ''");
ensureColumn("capture_session_draft_photo", "source", "TEXT NOT NULL DEFAULT 'gallery'");
