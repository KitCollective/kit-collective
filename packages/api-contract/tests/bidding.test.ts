import { describe, expect, it } from "vitest";
import {
  collectionBiddingPatchSchema,
  collectionSendBidRequestSchema,
} from "../src/collection/bidding.js";

describe("collectionBiddingPatchSchema", () => {
  it("accepts bidding toggle payload", () => {
    expect(collectionBiddingPatchSchema.parse({ biddingEnabled: true })).toEqual({
      biddingEnabled: true,
    });
  });
});

describe("collectionSendBidRequestSchema", () => {
  it("requires integer DKK amount at least 1", () => {
    expect(collectionSendBidRequestSchema.parse({ amountDkk: 350 })).toEqual({ amountDkk: 350 });
    expect(() => collectionSendBidRequestSchema.parse({ amountDkk: 0 })).toThrow();
  });
});
