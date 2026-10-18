import { describe, expect, it } from "vitest";
import { peerJerseyDockState } from "../src/search/bid-rules";

describe("peer jersey dock state (KIT-290, KIT-291)", () => {
  const pending = { amountDkk: 250, conversationId: "00000000-0000-4000-8000-0000000000c9" };

  it("shows Send bud on a jersey that is open for bid, with no pending bid", () => {
    expect(peerJerseyDockState({ biddingEnabled: true, myPendingBid: null })).toEqual({
      kind: "send",
    });
  });

  it("docks Skriv til handle alone on a jersey that is not open for bid, with no pending bid", () => {
    expect(peerJerseyDockState({ biddingEnabled: false, myPendingBid: null })).toEqual({
      kind: "message-only",
    });
  });

  it("shows the own bid row, not Send bud, while a bid is pending", () => {
    expect(peerJerseyDockState({ biddingEnabled: true, myPendingBid: pending })).toEqual({
      kind: "own-pending",
      amountDkk: 250,
      conversationId: pending.conversationId,
    });
  });

  it("keeps the own bid row after the owner closed the jersey for bid", () => {
    expect(peerJerseyDockState({ biddingEnabled: false, myPendingBid: pending })).toEqual({
      kind: "own-pending",
      amountDkk: 250,
      conversationId: pending.conversationId,
    });
  });
});
