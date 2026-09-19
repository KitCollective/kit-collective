import { describe, expect, it } from "vitest";
import {
  collectionActivityItemSchema,
  collectionActivitySchema,
  collectionRespondBidRequestSchema,
  collectionRespondBidResponseSchema,
} from "../src/collection/activity.js";

describe("collectionActivitySchema", () => {
  it("accepts a bid activity projection item", () => {
    const item = {
      id: "00000000-0000-0000-0000-000000000001",
      conversationId: "00000000-0000-0000-0000-000000000002",
      title: "Nyt bud på din trøje",
      kitLine: "F.C. København · 2024/25 · Hjemme",
      amountDkk: 500,
      status: "pending" as const,
      fromHandle: "mikkel_fck",
      unread: true,
      updatedAt: "2026-08-30T12:00:00.000Z",
    };

    expect(collectionActivityItemSchema.parse(item)).toEqual(item);
    expect(collectionActivitySchema.parse({ items: [item] })).toEqual({ items: [item] });
  });
});

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
