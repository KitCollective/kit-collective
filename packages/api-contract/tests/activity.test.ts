import { describe, expect, it } from "vitest";
import {
  collectionRespondBidRequestSchema,
  collectionRespondBidResponseSchema,
} from "../src/collection/activity.js";

describe("collectionRespondBidRequestSchema", () => {
  it("accepts accept or decline", () => {
    expect(collectionRespondBidRequestSchema.parse({ decision: "accept" })).toEqual({
      decision: "accept",
    });
    expect(collectionRespondBidRequestSchema.parse({ decision: "decline" })).toEqual({
      decision: "decline",
    });
  });
});

describe("collectionRespondBidResponseSchema", () => {
  it("returns accepted or declined status", () => {
    expect(collectionRespondBidResponseSchema.parse({ bidStatus: "accepted" })).toEqual({
      bidStatus: "accepted",
    });
  });
});
