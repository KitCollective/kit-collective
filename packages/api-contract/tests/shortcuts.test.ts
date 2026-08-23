import { describe, expect, it } from "vitest";
import {
  collectionJerseysQuerySchema,
  collectionShortcutIdParamSchema,
  collectionShortcutSchema,
  collectionShortcutsSchema,
  collectionShortcutWriteSchema,
} from "../src/collection/shortcuts.js";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("collectionShortcutWriteSchema", () => {
  it("accepts clubId facet with optional name", () => {
    const payload = { clubId: UUID };
    expect(collectionShortcutWriteSchema.parse(payload)).toEqual(payload);
  });

  it("rejects write without clubId", () => {
    expect(() => collectionShortcutWriteSchema.parse({ name: "Test" })).toThrow();
    expect(() => collectionShortcutWriteSchema.parse({})).toThrow();
  });
});

describe("collectionShortcutSchema", () => {
  it("accepts shortcut with match count", () => {
    const payload = {
      id: UUID,
      name: "F.C. København",
      sortOrder: 0,
      clubId: UUID,
      clubLabel: "F.C. København",
      matchCount: 2,
    };
    expect(collectionShortcutSchema.parse(payload)).toEqual(payload);
  });
});

describe("collectionShortcutsSchema", () => {
  it("accepts a shortcuts list", () => {
    const payload = {
      shortcuts: [
        {
          id: UUID,
          name: "F.C. København",
          sortOrder: 0,
          clubId: UUID,
          clubLabel: "F.C. København",
          matchCount: 0,
        },
      ],
    };
    expect(collectionShortcutsSchema.parse(payload)).toEqual(payload);
  });
});

describe("collectionJerseysQuerySchema", () => {
  it("accepts optional shortcutId", () => {
    expect(collectionJerseysQuerySchema.parse({})).toEqual({});
    expect(collectionJerseysQuerySchema.parse({ shortcutId: UUID })).toEqual({
      shortcutId: UUID,
    });
  });
});

describe("collectionShortcutIdParamSchema", () => {
  it("accepts shortcutId param", () => {
    expect(collectionShortcutIdParamSchema.parse({ shortcutId: UUID })).toEqual({
      shortcutId: UUID,
    });
  });
});
