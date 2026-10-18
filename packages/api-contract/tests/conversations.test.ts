import { describe, expect, it } from "vitest";
import { collectionConversationsSchema } from "../src/collection/conversations.js";

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

describe("collectionConversationsSchema", () => {
  it("accepts an empty Indbakke", () => {
    const empty = { waiting: [], conversations: [], unreadCount: 0 };
    expect(collectionConversationsSchema.parse(empty)).toEqual(empty);
  });

  it("carries waiting Buds and conversations with a latest event of each kind", () => {
    const body = {
      waiting: [
        {
          messageId: ID(1),
          conversationId: ID(2),
          userJerseyId: ID(3),
          bidderHandle: "mikkel_fck",
          amountDkk: 400,
          createdAt: "2026-10-17T12:00:00.000Z",
          jersey: { clubLabel: "Brøndby IF", seasonLabel: "2024/25", type: "Hjemme" },
          thumbUrl: `/v1/collection/photos/${ID(4)}`,
        },
      ],
      conversations: [
        {
          id: ID(2),
          peerHandle: "mikkel_fck",
          peerInitial: "M",
          peerAvatarUrl: null,
          latest: { kind: "bid", amountDkk: 400, status: "pending", role: "incoming" },
          updatedAt: "2026-10-17T12:00:00.000Z",
          unread: true,
        },
        {
          id: ID(5),
          peerHandle: "sofie",
          peerInitial: "S",
          peerAvatarUrl: "/v1/identity/peers/x/avatar",
          latest: { kind: "text", text: "Hej" },
          updatedAt: "2026-10-16T12:00:00.000Z",
          unread: false,
        },
        {
          id: ID(6),
          peerHandle: "jonas",
          peerInitial: "J",
          peerAvatarUrl: null,
          latest: { kind: "image" },
          updatedAt: "2026-10-15T12:00:00.000Z",
          unread: false,
        },
      ],
      unreadCount: 1,
    };
    expect(collectionConversationsSchema.parse(body)).toEqual(body);
  });

  it("allows a null jersey id and thumb once the UserJersey is deleted", () => {
    const row = {
      messageId: ID(1),
      conversationId: ID(2),
      userJerseyId: null,
      bidderHandle: "mikkel_fck",
      amountDkk: 400,
      createdAt: "2026-10-17T12:00:00.000Z",
      jersey: { clubLabel: "Brøndby IF", seasonLabel: "2024/25", type: "Hjemme" },
      thumbUrl: null,
    };
    const parsed = collectionConversationsSchema.parse({
      waiting: [row],
      conversations: [],
      unreadCount: 0,
    });
    expect(parsed.waiting[0]?.userJerseyId).toBeNull();
  });

  it("requires waiting", () => {
    expect(
      collectionConversationsSchema.safeParse({ conversations: [], unreadCount: 0 }).success,
    ).toBe(false);
  });
});
