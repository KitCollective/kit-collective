import { describe, expect, it } from "vitest";
import {
  collectionConversationDetailSchema,
  collectionConversationMessageSchema,
  collectionSendMessageRequestSchema,
} from "../src/collection/conversation-detail.js";

describe("collectionConversationMessageSchema", () => {
  it("accepts an outgoing text message", () => {
    const parsed = collectionConversationMessageSchema.parse({
      id: "00000000-0000-0000-0000-000000000001",
      kind: "text",
      role: "outgoing",
      text: "Hej",
      createdAt: "2026-01-01T12:00:00.000Z",
    });
    expect(parsed.text).toBe("Hej");
  });

  it("accepts an incoming image message with imageUrl", () => {
    const parsed = collectionConversationMessageSchema.parse({
      id: "00000000-0000-0000-0000-000000000002",
      kind: "image",
      role: "incoming",
      imageUrl:
        "/v1/collection/conversations/00000000-0000-0000-0000-000000000099/messages/00000000-0000-0000-0000-000000000002/photo",
      createdAt: "2026-01-01T12:00:00.000Z",
    });
    expect(parsed.kind).toBe("image");
  });
});

describe("collectionConversationDetailSchema", () => {
  it("accepts a conversation whose message carries its UserJersey", () => {
    const parsed = collectionConversationDetailSchema.parse({
      id: "00000000-0000-0000-0000-000000000099",
      peerHandle: "mikkel_fck",
      messages: [
        {
          id: "00000000-0000-0000-0000-000000000001",
          kind: "text",
          role: "incoming",
          text: "Hej",
          createdAt: "2026-01-01T12:00:00.000Z",
          jersey: {
            userJerseyId: "00000000-0000-0000-0000-000000000042",
            thumbUrl: "/v1/collection/showcase/photos/00000000-0000-0000-0000-000000000043",
            openForBid: true,
            clubLabel: "FC København",
            seasonLabel: "2024/25",
            type: "home",
            size: "m",
          },
        },
      ],
    });
    expect(parsed.peerHandle).toBe("mikkel_fck");
    expect(parsed.messages[0]?.jersey).toEqual({
      userJerseyId: "00000000-0000-0000-0000-000000000042",
      thumbUrl: "/v1/collection/showcase/photos/00000000-0000-0000-0000-000000000043",
      openForBid: true,
      clubLabel: "FC København",
      seasonLabel: "2024/25",
      type: "home",
      size: "m",
    });
  });

  it("accepts a system line with its reason, the accepted amount and a jersey that is gone", () => {
    const parsed = collectionConversationMessageSchema.parse({
      id: "00000000-0000-0000-0000-000000000005",
      kind: "system",
      role: "incoming",
      systemReason: "jersey_gone",
      bidAmountDkk: 450,
      createdAt: "2026-01-01T12:00:00.000Z",
      jersey: {
        userJerseyId: null,
        thumbUrl: null,
        openForBid: false,
        clubLabel: "FC København",
        seasonLabel: "2024/25",
        type: "home",
        size: "m",
      },
    });
    expect(parsed.systemReason).toBe("jersey_gone");
  });

  it("rejects an unknown system reason", () => {
    expect(() =>
      collectionConversationMessageSchema.parse({
        id: "00000000-0000-0000-0000-000000000006",
        kind: "system",
        role: "incoming",
        systemReason: "bid_declined",
        createdAt: "2026-01-01T12:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects a conversation with a jerseyContext", () => {
    expect(() =>
      collectionConversationDetailSchema.parse({
        id: "00000000-0000-0000-0000-000000000099",
        peerHandle: "mikkel_fck",
        jerseyContext: {
          clubLabel: "FC København",
          seasonLabel: "2024/25",
          type: "home",
        },
        messages: [],
      }),
    ).toThrow();
  });
});

describe("collectionSendMessageRequestSchema", () => {
  it("requires text or contentBase64", () => {
    expect(() => collectionSendMessageRequestSchema.parse({})).toThrow();
  });

  it("accepts text-only send", () => {
    expect(collectionSendMessageRequestSchema.parse({ text: "Hej" })).toEqual({ text: "Hej" });
  });

  it("accepts image-only send with optional replyToMessageId", () => {
    expect(
      collectionSendMessageRequestSchema.parse({
        contentBase64: "aGVsbG8=",
        replyToMessageId: "00000000-0000-0000-0000-000000000003",
      }),
    ).toMatchObject({ contentBase64: "aGVsbG8=" });
  });
});
