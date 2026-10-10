import { describe, expect, it } from "vitest";
import { adminVisionLabelListSchema } from "../src/index.js";

describe("adminVisionLabelListSchema", () => {
  it("accepts labelled rows without visionRaw photo payloads", () => {
    const list = {
      total: 1,
      acceptedCount: 1,
      labelledCount: 1,
      hitRateCaption: "1 / 1",
      rows: [
        {
          jobId: "550e8400-e29b-41d4-a716-446655440000",
          createdAt: "2026-09-15T00:00:00.000Z",
          class: "accepted" as const,
          userAction: "accepted" as const,
          suggested: {
            clubId: "550e8400-e29b-41d4-a716-446655440001",
            seasonId: "550e8400-e29b-41d4-a716-446655440002",
            type: "home" as const,
            clubLabel: "F.C. Copenhagen",
            seasonLabel: "2024/25",
          },
          selected: {
            clubId: "550e8400-e29b-41d4-a716-446655440001",
            seasonId: "550e8400-e29b-41d4-a716-446655440002",
            type: "home" as const,
            clubLabel: "F.C. Copenhagen",
            seasonLabel: "2024/25",
          },
          fieldHits: {
            side: true,
            season: true,
            type: true,
            catalogKitId: true,
            player: true,
            patch: true,
          },
          photoKeys: ["user/collector/jersey/photo/grid.jpg"],
        },
      ],
    };
    expect(adminVisionLabelListSchema.parse(list)).toEqual(list);
  });

  it("rejects visionRaw on a label row", () => {
    expect(() =>
      adminVisionLabelListSchema.parse({
        total: 1,
        acceptedCount: 0,
        labelledCount: 1,
        hitRateCaption: "0 / 1",
        rows: [
          {
            jobId: "550e8400-e29b-41d4-a716-446655440000",
            createdAt: "2026-09-15T00:00:00.000Z",
            class: "model",
            userAction: "edited",
            suggested: {},
            selected: { type: "home", seasonId: "550e8400-e29b-41d4-a716-446655440002" },
            fieldHits: {
              side: false,
              season: false,
              type: true,
              catalogKitId: true,
              player: true,
              patch: true,
            },
            photoKeys: [],
            visionRaw: '{"photo":"base64"}',
          },
        ],
      }),
    ).toThrow();
  });
});
