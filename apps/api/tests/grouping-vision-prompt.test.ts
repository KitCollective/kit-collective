import { describe, expect, it } from "vitest";
import {
  decodeGroupingVisionGroups,
  GROUPING_VISION_SYSTEM_PROMPT,
  groupingVisionUserPrompt,
  MAX_PHOTOS_PER_GROUP,
} from "../src/vision/grouping-vision-prompt.js";

const PHOTO_A = "11111111-1111-4111-8111-111111111111";
const PHOTO_B = "22222222-2222-4222-8222-222222222222";
const PHOTO_C = "33333333-3333-4333-8333-333333333333";

describe("grouping vision prompt", () => {
  it("teaches same-shirt groups, exact photoIds, and the ten-photo cap", () => {
    expect(GROUPING_VISION_SYSTEM_PROMPT).toMatch(/SAME shirt/i);
    expect(GROUPING_VISION_SYSTEM_PROMPT).toContain(String(MAX_PHOTOS_PER_GROUP));
    expect(GROUPING_VISION_SYSTEM_PROMPT).toMatch(/never invent/i);
    expect(GROUPING_VISION_SYSTEM_PROMPT).toMatch(/roles/i);
  });

  it("lists existing shirts on an incremental pass without asking to split them", () => {
    const user = groupingVisionUserPrompt(1, [{ photoIds: [PHOTO_A, PHOTO_B] }]);
    expect(user).toContain(PHOTO_A);
    expect(user).toContain(PHOTO_B);
    expect(user).toMatch(/do not split/i);
    expect(user).toMatch(/NEW photo/i);
  });

  it("keeps only known photoIds, drops duplicates, and caps a group at ten", () => {
    const extras = Array.from(
      { length: 12 },
      (_, index) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`,
    );
    const decoded = decodeGroupingVisionGroups(
      JSON.stringify({
        groups: [
          { photoIds: [PHOTO_A, PHOTO_A, "not-a-known-id", PHOTO_B], confidence: 0.85 },
          { photoIds: [PHOTO_B, PHOTO_C], confidence: 80 },
          { photoIds: extras, confidence: 0.9 },
        ],
      }),
      [PHOTO_A, PHOTO_B, PHOTO_C, ...extras],
    );

    expect(decoded?.[0]?.photoIds).toEqual([PHOTO_A, PHOTO_B]);
    expect(decoded?.[0]?.confidence).toBe(85);
    expect(decoded?.[1]?.photoIds).toEqual([PHOTO_C]);
    expect(decoded?.[1]?.confidence).toBe(80);
    expect(decoded?.[2]?.photoIds).toHaveLength(MAX_PHOTOS_PER_GROUP);
  });
});
