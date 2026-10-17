import type { CollectionActivityItem, CollectionConversation } from "@kit/api-contract";
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
    snippet: "Hej",
    updatedAt: "2026-10-01T10:00:00.000Z",
    unread: false,
  };
}

function activity(
  id: string,
  conversationId: string,
  userJerseyId: string | null,
  kitLine: string,
): CollectionActivityItem {
  return {
    id,
    conversationId,
    userJerseyId,
    title: "Bud på trøjen",
    kitLine,
    amountDkk: 400,
    status: "pending",
    fromHandle: "peer",
    unread: false,
    updatedAt: "2026-10-01T10:00:00.000Z",
  };
}

describe("filterInboxByJersey", () => {
  const conversations = [conversation(C1), conversation(C2), conversation(C3)];
  const items = [
    activity("00000000-0000-4000-8000-0000000000d1", C1, JERSEY_A, "FC København 2023/24"),
    activity("00000000-0000-4000-8000-0000000000d2", C2, JERSEY_A, "FC København 2023/24"),
    activity("00000000-0000-4000-8000-0000000000d3", C3, JERSEY_B, "AGF 2022/23"),
    activity("00000000-0000-4000-8000-0000000000d4", C3, null, "Slettet trøje"),
  ];

  it("passes everything through when no jersey is set", () => {
    const result = filterInboxByJersey(conversations, items, null);
    expect(result.conversations).toBe(conversations);
    expect(result.activityItems).toBe(items);
    expect(result.kitLine).toBeNull();
  });

  it("treats undefined and an empty id like no filter", () => {
    expect(filterInboxByJersey(conversations, items, undefined).activityItems).toBe(items);
    expect(filterInboxByJersey(conversations, items, "").activityItems).toBe(items);
  });

  it("keeps only the activity items of the jersey", () => {
    const result = filterInboxByJersey(conversations, items, JERSEY_A);
    expect(result.activityItems.map((item) => item.conversationId)).toEqual([C1, C2]);
  });

  it("keeps only the conversations that appear among the filtered activity items", () => {
    const result = filterInboxByJersey(conversations, items, JERSEY_A);
    expect(result.conversations.map((item) => item.id)).toEqual([C1, C2]);
  });

  it("does not match through an item of another jersey or a deleted one", () => {
    const result = filterInboxByJersey(conversations, items, JERSEY_B);
    expect(result.conversations.map((item) => item.id)).toEqual([C3]);
    expect(result.activityItems).toHaveLength(1);
  });

  it("reads the kit line from the first matching activity item", () => {
    expect(filterInboxByJersey(conversations, items, JERSEY_B).kitLine).toBe("AGF 2022/23");
  });

  it("returns empty lists and no kit line when nothing matches", () => {
    const result = filterInboxByJersey(
      conversations,
      items,
      "00000000-0000-4000-8000-0000000000ff",
    );
    expect(result.conversations).toEqual([]);
    expect(result.activityItems).toEqual([]);
    expect(result.kitLine).toBeNull();
  });
});
