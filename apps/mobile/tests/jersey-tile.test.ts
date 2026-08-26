import { describe, expect, it } from "vitest";
import { jerseyTileMetaLine } from "../src/components/jersey-tile-meta";

describe("jerseyTileMetaLine", () => {
  it("formats season and kit type with middle dot separator", () => {
    expect(jerseyTileMetaLine("2023/24", "Hjemme")).toBe("2023/24 · Hjemme");
  });
});
