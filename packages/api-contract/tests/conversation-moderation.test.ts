import { describe, expect, it } from "vitest";
import {
  collectionBlockConversationResponseSchema,
  collectionBlockPeerResponseSchema,
  collectionConversationPeerSchema,
  collectionReportConversationRequestSchema,
  collectionReportConversationResponseSchema,
  collectionReportPeerResponseSchema,
} from "../src/collection/conversation-moderation.js";

describe("collection conversation moderation contract", () => {
  it("parses peer stub with optional city", () => {
    expect(
      collectionConversationPeerSchema.parse({
        peerId: "00000000-0000-0000-0000-000000000010",
        handle: "collector_a",
        jerseyCount: 3,
        city: "København",
        avatarUrl: "/v1/identity/peers/00000000-0000-0000-0000-000000000010/avatar",
        conversationId: "00000000-0000-0000-0000-000000000020",
      }),
    ).toEqual({
      peerId: "00000000-0000-0000-0000-000000000010",
      handle: "collector_a",
      jerseyCount: 3,
      city: "København",
      avatarUrl: "/v1/identity/peers/00000000-0000-0000-0000-000000000010/avatar",
      conversationId: "00000000-0000-0000-0000-000000000020",
    });

    expect(
      collectionConversationPeerSchema.parse({
        peerId: "00000000-0000-0000-0000-000000000011",
        handle: "collector_b",
        jerseyCount: 0,
        avatarUrl: null,
        conversationId: null,
      }),
    ).toEqual({
      peerId: "00000000-0000-0000-0000-000000000011",
      handle: "collector_b",
      jerseyCount: 0,
      avatarUrl: null,
      conversationId: null,
    });
  });

  it("rejects peer stub with unknown fields", () => {
    expect(() =>
      collectionConversationPeerSchema.parse({
        peerId: "00000000-0000-0000-0000-000000000012",
        handle: "collector_a",
        jerseyCount: 1,
        avatarUrl: null,
        conversationId: null,
        email: "secret@example.com",
      }),
    ).toThrow();
  });

  it("parses report request and response", () => {
    expect(collectionReportConversationRequestSchema.parse({})).toEqual({});
    expect(
      collectionReportConversationResponseSchema.parse({
        reportId: "00000000-0000-0000-0000-000000000001",
      }),
    ).toEqual({
      reportId: "00000000-0000-0000-0000-000000000001",
    });
  });

  it("parses block response", () => {
    expect(
      collectionBlockConversationResponseSchema.parse({
        blockId: "00000000-0000-0000-0000-000000000002",
      }),
    ).toEqual({
      blockId: "00000000-0000-0000-0000-000000000002",
    });
  });

  it("reuses conversation shapes for peer report and block", () => {
    expect(
      collectionReportPeerResponseSchema.parse({
        reportId: "00000000-0000-0000-0000-000000000003",
      }),
    ).toEqual({
      reportId: "00000000-0000-0000-0000-000000000003",
    });

    expect(
      collectionBlockPeerResponseSchema.parse({
        blockId: "00000000-0000-0000-0000-000000000004",
      }),
    ).toEqual({
      blockId: "00000000-0000-0000-0000-000000000004",
    });
  });
});
