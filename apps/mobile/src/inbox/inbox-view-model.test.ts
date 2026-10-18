import type {
  CollectionConversation,
  CollectionConversationLatest,
  CollectionConversations,
  CollectionWaitingBid,
} from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import { buildInbox } from "@/inbox/inbox-view-model";

const ID_A = "00000000-0000-4000-8000-0000000000a1";
const ID_B = "00000000-0000-4000-8000-0000000000b1";
const JERSEY = "00000000-0000-4000-8000-0000000000e1";

/** The time label is a seam: the view-model takes it, so the test pins what it was given. */
const formatTime = (iso: string) => `t:${iso.slice(11, 16)}`;

function waiting(overrides: Partial<CollectionWaitingBid> = {}): CollectionWaitingBid {
  return {
    messageId: ID_A,
    conversationId: ID_B,
    userJerseyId: JERSEY,
    bidderHandle: "e2e_peer",
    amountDkk: 300,
    createdAt: "2026-10-01T10:30:00.000Z",
    jersey: { clubLabel: "Brøndby IF", seasonLabel: "2023/24", type: "Hjemme" },
    thumbUrl: "/v1/collection/photos/p1",
    ...overrides,
  };
}

function conversation(
  latest: CollectionConversationLatest,
  overrides: Partial<CollectionConversation> = {},
): CollectionConversation {
  return {
    id: ID_B,
    peerHandle: "mikkel_fck",
    peerInitial: "M",
    peerAvatarUrl: null,
    latest,
    updatedAt: "2026-10-01T09:15:00.000Z",
    unread: false,
    ...overrides,
  };
}

function response(overrides: Partial<CollectionConversations> = {}): CollectionConversations {
  return { waiting: [], conversations: [], unreadCount: 0, ...overrides };
}

describe("buildInbox", () => {
  it("reads a Conversation without readable text as Ny besked", () => {
    const inbox = buildInbox(
      response({ conversations: [conversation({ kind: "text", text: "" })] }),
      formatTime,
    );

    expect(inbox.conversations.rows[0]?.snippet).toBe("Ny besked");
  });

  describe("Venter på dit svar", () => {
    it("has no section when nothing waits", () => {
      const inbox = buildInbox(
        response({ conversations: [conversation({ kind: "text", text: "Hej" })] }),
        formatTime,
      );

      expect(inbox.waiting).toBeNull();
    });

    it("is a section with the count beside the heading when Buds wait", () => {
      const inbox = buildInbox(
        response({ waiting: [waiting(), waiting({ messageId: ID_B })] }),
        formatTime,
      );

      expect(inbox.waiting?.title).toBe("Venter på dit svar");
      expect(inbox.waiting?.count).toBe("2");
      expect(inbox.waiting?.rows).toHaveLength(2);
    });

    it("shows the bid row with handle, jersey line, Bud på n kr, time and the 48 x 60 thumb", () => {
      const inbox = buildInbox(response({ waiting: [waiting()] }), formatTime);
      const row = inbox.waiting?.rows[0];

      expect(row).toMatchObject({
        variant: "bid",
        key: ID_A,
        conversationId: ID_B,
        messageId: ID_A,
        handle: "e2e_peer",
        jerseyLine: "Brøndby IF 2023/24 · Hjemme",
        snippet: "Bud på 300 kr",
        timeLabel: "t:10:30",
        thumbUrl: "/v1/collection/photos/p1",
      });
    });

    it("keeps the thumb empty when the jersey has none", () => {
      const inbox = buildInbox(response({ waiting: [waiting({ thumbUrl: null })] }), formatTime);

      expect(inbox.waiting?.rows[0]?.thumbUrl).toBeNull();
    });

    it("carries no unread dot, even when the Conversation of the Bud is unread", () => {
      const inbox = buildInbox(
        response({
          waiting: [waiting()],
          conversations: [conversation({ kind: "text", text: "Hej" }, { id: ID_B, unread: true })],
        }),
        formatTime,
      );

      expect(inbox.waiting?.rows[0]?.unread).toBe(false);
    });

    it("names the row with handle, jersey line, snippet and time", () => {
      const inbox = buildInbox(response({ waiting: [waiting()] }), formatTime);

      expect(inbox.waiting?.rows[0]?.accessibilityLabel).toBe(
        "e2e_peer, Brøndby IF 2023/24 · Hjemme, Bud på 300 kr, t:10:30",
      );
    });
  });

  describe("Samtaler", () => {
    it("lists one person row per Collector in the order given", () => {
      const inbox = buildInbox(
        response({
          conversations: [
            conversation({ kind: "text", text: "Nyeste" }, { id: ID_A, peerHandle: "anna" }),
            conversation({ kind: "text", text: "Ældre" }, { id: ID_B, peerHandle: "bo" }),
          ],
        }),
        formatTime,
      );

      expect(inbox.conversations.title).toBe("Samtaler");
      expect(inbox.conversations.rows.map((row) => row.handle)).toEqual(["anna", "bo"]);
      expect(inbox.conversations.rows[0]).toMatchObject({
        variant: "person",
        key: ID_A,
        conversationId: ID_A,
        initial: "M",
        avatarUrl: null,
        timeLabel: "t:09:15",
      });
    });

    it("passes the peer photo on for the 48px Avatar", () => {
      const inbox = buildInbox(
        response({
          conversations: [
            conversation(
              { kind: "text", text: "Hej" },
              { peerAvatarUrl: "/v1/identity/peers/abc/avatar" },
            ),
          ],
        }),
        formatTime,
      );

      expect(inbox.conversations.rows[0]?.avatarUrl).toBe("/v1/identity/peers/abc/avatar");
    });

    it.each<[string, CollectionConversationLatest, string]>([
      ["a text", { kind: "text", text: "Er den stadig til salg?" }, "Er den stadig til salg?"],
      ["an image", { kind: "image" }, "Billede"],
      [
        "my pending Bud",
        { kind: "bid", amountDkk: 400, status: "pending", role: "outgoing" },
        "Dit bud på 400 kr · Afventer svar",
      ],
      [
        "my accepted Bud",
        { kind: "bid", amountDkk: 400, status: "accepted", role: "outgoing" },
        "Bud accepteret · 400 kr",
      ],
      [
        "my declined Bud",
        { kind: "bid", amountDkk: 400, status: "declined", role: "outgoing" },
        "Bud afvist · 400 kr",
      ],
      [
        "their pending Bud",
        { kind: "bid", amountDkk: 250, status: "pending", role: "incoming" },
        "Bud på 250 kr · Afventer dit svar",
      ],
      [
        "their Bud I accepted",
        { kind: "bid", amountDkk: 250, status: "accepted", role: "incoming" },
        "Du accepterede buddet · 250 kr",
      ],
      [
        "their Bud I declined",
        { kind: "bid", amountDkk: 250, status: "declined", role: "incoming" },
        "Du afviste buddet · 250 kr",
      ],
    ])("reads %s as the snippet", (_name, latest, snippet) => {
      const inbox = buildInbox(response({ conversations: [conversation(latest)] }), formatTime);

      expect(inbox.conversations.rows[0]?.snippet).toBe(snippet);
    });

    it("marks an unread row, with no row fill in the model", () => {
      const inbox = buildInbox(
        response({
          conversations: [conversation({ kind: "text", text: "Hej" }, { unread: true })],
        }),
        formatTime,
      );

      expect(inbox.conversations.rows[0]?.unread).toBe(true);
      expect(Object.keys(inbox.conversations.rows[0] ?? {})).not.toContain("fill");
    });

    it("leaves a read row unmarked", () => {
      const inbox = buildInbox(
        response({ conversations: [conversation({ kind: "text", text: "Hej" })] }),
        formatTime,
      );

      expect(inbox.conversations.rows[0]?.unread).toBe(false);
    });

    it("names a read row with handle, snippet and time", () => {
      const inbox = buildInbox(
        response({ conversations: [conversation({ kind: "text", text: "Hej" })] }),
        formatTime,
      );

      expect(inbox.conversations.rows[0]?.accessibilityLabel).toBe("mikkel_fck, Hej, t:09:15");
    });

    it("adds ulæst to the name of an unread row", () => {
      const inbox = buildInbox(
        response({
          conversations: [conversation({ kind: "text", text: "Hej" }, { unread: true })],
        }),
        formatTime,
      );

      expect(inbox.conversations.rows[0]?.accessibilityLabel).toBe(
        "mikkel_fck, Hej, t:09:15, ulæst",
      );
    });
  });

  describe("empty", () => {
    it("is true when both lists are empty", () => {
      expect(buildInbox(response(), formatTime).empty).toBe(true);
    });

    it("is false when only Buds wait", () => {
      expect(buildInbox(response({ waiting: [waiting()] }), formatTime).empty).toBe(false);
    });

    it("is false when only Conversations exist", () => {
      const inbox = buildInbox(
        response({ conversations: [conversation({ kind: "image" })] }),
        formatTime,
      );

      expect(inbox.empty).toBe(false);
    });
  });
});
