import { describe, expect, it } from "vitest";
import { normalizeTransfermarktClubId } from "../src/transfermarkt-club-id.js";

describe("normalizeTransfermarktClubId", () => {
  it("strips the club- prefix", () => {
    expect(normalizeTransfermarktClubId("club-190")).toBe("190");
  });

  it("passes through bare Transfermarkt ids", () => {
    expect(normalizeTransfermarktClubId("190")).toBe("190");
  });
});
