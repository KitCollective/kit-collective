import { describe, expect, it } from "vitest";
import { peerJerseyDockState } from "../src/search/bid-rules";

describe("peer jersey dock state (KIT-290)", () => {
  it("shows Send bud on a jersey that is open for bid", () => {
    expect(peerJerseyDockState({ biddingEnabled: true })).toBe("send");
  });

  it("shows no dock on a jersey that is not open for bid", () => {
    expect(peerJerseyDockState({ biddingEnabled: false })).toBe("none");
  });
});
