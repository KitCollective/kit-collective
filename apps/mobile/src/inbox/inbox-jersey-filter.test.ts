import type { CollectionConversation, CollectionWaitingBid } from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import { filterInboxByJersey } from "@/inbox/inbox-jersey-filter";

const JERSEY_A = "00000000-0000-4000-8000-0000000000a1";
const JERSEY_B = "00000000-0000-4000-8000-0000000000b1";

const C1 = "00000000-0000-4000-8000-0000000000c1";
const C2 = "00000000-0000-4000-8000-0000000000c2";
const C3 = "00000000-0000-4000-8000-0000000000c3";

function conversation(id: string): CollectionConversation {
  return {
    id,
    peerHandle: `peer-${id.slice(-2)}`,
    peerInitial: "P",
    peerAvatarUrl: null,
    latest: { kind: "text", text: "Hej" },
    updatedAt: "2026-10-01T10:00:00.000Z",
    unread: false,
  };
}

function bid(
  messageId: string,
  conversationId: string,
  userJerseyId: string | null,
  clubLabel: string,
  seasonLabel: string,
): CollectionWaitingBid {
  return {
    messageId,
    conversationId,
    userJerseyId,
    bidderHandle: "peer",
    amountDkk: 400,
    createdAt: "2026-10-01T10:00:00.000Z",
    jersey: { clubLabel, seasonLabel, type: "Hjemme" },
    thumbUrl: null,
  };
}

describe("filterInboxByJersey", () => {
  const response = {
    conversations: [conversation(C1), conversation(C2), conversation(C3)],
    waiting: [
      bid("00000000-0000-4000-8000-0000000000d1", C1, JERSEY_A, "FC København", "2023/24"),
      bid("00000000-0000-4000-8000-0000000000d2", C2, JERSEY_A, "FC København", "2023/24"),
      bid("00000000-0000-4000-8000-0000000000d3", C3, JERSEY_B, "AGF", "2022/23"),
      bid("00000000-0000-4000-8000-0000000000d4", C3, null, "Slettet", "2020/21"),
    ],
  };

  it("passes everything through when no jersey is set", () => {
    const result = filterInboxByJersey(response, null);
    expect(result.conversations).toBe(response.conversations);
    expect(result.waiting).toBe(response.waiting);
    expect(result.kitLine).toBeNull();
  });

  it("treats undefined and an empty id like no filter", () => {
    expect(filterInboxByJersey(response, undefined).waiting).toBe(response.waiting);
    expect(filterInboxByJersey(response, "").waiting).toBe(response.waiting);
  });

  it("keeps only the waiting Buds of the jersey", () => {
    const result = filterInboxByJersey(response, JERSEY_A);
    expect(result.waiting.map((item) => item.conversationId)).toEqual([C1, C2]);
  });

  it("keeps only the Conversations that hold a waiting Bud on the jersey", () => {
    const result = filterInboxByJersey(response, JERSEY_A);
    expect(result.conversations.map((item) => item.id)).toEqual([C1, C2]);
  });

  it("does not match through a Bud on another jersey or a deleted one", () => {
    const result = filterInboxByJersey(response, JERSEY_B);
    expect(result.conversations.map((item) => item.id)).toEqual([C3]);
    expect(result.waiting).toHaveLength(1);
  });

  it("reads the kit line (club and season) from the first matching Bud", () => {
    expect(filterInboxByJersey(response, JERSEY_B).kitLine).toBe("AGF 2022/23");
  });

  it("returns empty lists and no kit line when nothing matches", () => {
    const result = filterInboxByJersey(response, "00000000-0000-4000-8000-0000000000ff");
    expect(result.conversations).toEqual([]);
    expect(result.waiting).toEqual([]);
    expect(result.kitLine).toBeNull();
  });
});
