const POINTER_KEY = "capture_camera_active_session";

let pointerMode: "sqlite" | "memory" = "sqlite";
let memoryActiveSessionId: string | null = null;

type AppKvDb = {
  runSync: (sql: string, params?: unknown[]) => void;
  getFirstSync: <T>(sql: string, params?: unknown[]) => T | null;
};

function sqliteDb(): AppKvDb {
  const mod = require("@/drafts/db") satisfies { draftDb: AppKvDb };
  return mod.draftDb;
}

export function setMemoryActiveCameraCaptureSessionIdForTests(sessionId: string | null): void {
  pointerMode = "memory";
  memoryActiveSessionId = sessionId;
}

export function clearMemoryActiveCameraCaptureSessionIdForTests(): void {
  pointerMode = "memory";
  memoryActiveSessionId = null;
}

export function setActiveCameraCaptureSessionId(sessionId: string): void {
  if (pointerMode === "memory") {
    memoryActiveSessionId = sessionId;
    return;
  }

  sqliteDb().runSync(
    `INSERT INTO app_kv (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [POINTER_KEY, sessionId],
  );
}

export function getActiveCameraCaptureSessionId(): string | null {
  if (pointerMode === "memory") {
    return memoryActiveSessionId;
  }

  const row = sqliteDb().getFirstSync<{ value: string }>(`SELECT value FROM app_kv WHERE key = ?`, [
    POINTER_KEY,
  ]);
  return row?.value ?? null;
}

export function clearActiveCameraCaptureSessionId(): void {
  if (pointerMode === "memory") {
    memoryActiveSessionId = null;
    return;
  }

  sqliteDb().runSync(`DELETE FROM app_kv WHERE key = ?`, [POINTER_KEY]);
}
