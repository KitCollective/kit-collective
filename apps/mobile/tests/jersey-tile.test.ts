import { describe, expect, it } from "vitest";
import { KIT_TYPE_LABELS_DA } from "@kit/domain";

describe("jersey tile caption", () => {
  it("formats season and kit type with middle dot separator", () => {
    const seasonLabel = "2023/24";
    const typeLabel = KIT_TYPE_LABELS_DA.home;
    expect(`${seasonLabel} · ${typeLabel}`).toBe("2023/24 · Hjemme");
  });
});
