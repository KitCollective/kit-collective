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
`);
