import { describe, expect, it } from "vitest";
import { adminVisionImproveListSchema } from "../src/index.js";

const proposedRow = {
  id: "550e8400-e29b-41d4-a716-446655440100",
  kind: "alias" as const,
  status: "proposed" as const,
  count: 3,
  fingerprint: "alias:club:fck:side",
  suggested: { clubLabel: "FCK" },
  selected: {
    clubId: "550e8400-e29b-41d4-a716-446655440001",
    clubLabel: "F.C. Copenhagen",
  },
  lastSeenAt: "2026-09-15T00:00:00.000Z",
};

describe("adminVisionImproveListSchema", () => {
  it("accepts proposed rows without visionRaw", () => {
    const list = { total: 1, rows: [proposedRow] };
    expect(adminVisionImproveListSchema.parse(list)).toEqual(list);
  });

  it("rejects visionRaw on an improve row", () => {
    expect(() =>
      adminVisionImproveListSchema.parse({
        total: 1,
        rows: [{ ...proposedRow, visionRaw: '{"photo":"base64"}' }],
      }),
    ).toThrow();
  });
});
