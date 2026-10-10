import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const storeSource = readFileSync(
  join(__dirname, "../src/capture/captureSessionSqliteStore.ts"),
  "utf8",
);

function listedInserts(source: string): { table: string; columns: number; values: number }[] {
  const inserts: { table: string; columns: number; values: number }[] = [];
  const pattern = /INSERT INTO ([a-z_]+) \(([\s\S]*?)\)\s*VALUES \(([\s\S]*?)\)/g;
  for (const match of source.matchAll(pattern)) {
    const table = match[1];
    const columnList = match[2];
    const valueList = match[3];
    if (!table || columnList === undefined || valueList === undefined) {
      continue;
    }
    const columns = columnList
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const values = valueList
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    inserts.push({ table, columns: columns.length, values: values.length });
  }
  return inserts;
}

describe("capture session sqlite inserts", () => {
  it("binds one value per listed column so SQLite does not reject the draft row", () => {
    const inserts = listedInserts(storeSource);
    expect(inserts.map((entry) => entry.table)).toContain("capture_session_draft");
    for (const insert of inserts) {
      expect(insert.values, insert.table).toBe(insert.columns);
    }
  });

  it("persists the Tjek flag and the overview session fields, and no longer the pending suggestion", () => {
    const dbSource = readFileSync(join(__dirname, "../src/drafts/db.ts"), "utf8");
    for (const column of [
      "needs_check",
      "parked_at",
      "grouping_settled_key",
      "saved_drafts_json",
    ]) {
      expect(storeSource, column).toContain(column);
      expect(dbSource, column).toContain(column);
    }
    expect(storeSource).not.toContain("pending_grouping_json");
    expect(storeSource).not.toContain("grouping_design_gap");
  });
});
