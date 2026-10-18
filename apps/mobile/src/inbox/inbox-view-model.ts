import type {
  CollectionConversation,
  CollectionConversationLatest,
  CollectionConversations,
  CollectionWaitingBid,
} from "@kit/api-contract";

/**
 * Pure Indbakke view-model (docs/design-system.md → Inbox and Thread row, Revision 2026-10-10):
 * the Indbakke response in, the two sections and their row text out. No React Native import,
 * so it is tested without rendering.
 *
 * Wording the lock does not give (Inbox gives only "Dit bud på n kr · Afventer svar" and "Bud
 * accepteret · n kr", "and so on"), kept to the thread view-model's words and flagged for
 * /to-design: the declined Bud, and the Collector's own answer to a Bud ("Du accepterede
 * buddet", "Du afviste buddet", "Afventer dit svar").
 */

export type InboxRow = {
  /** `bid` under Venter på dit svar, `person` under Samtaler (Thread row variants). */
  variant: "bid" | "person";
  key: string;
  conversationId: string;
  /** The Bud a `bid` row opens the thread at; null on a `person` row. */
  messageId: string | null;
  handle: string;
  snippet: string;
  /** The jersey line (club season · type) of a `bid` row; null on a `person` row. */
  jerseyLine: string | null;
  timeLabel: string;
  /** The 8px dot and the snippet weight 500. A `bid` row never carries it. */
  unread: boolean;
  /** `person` leading slot: the initial, or the peer photo when there is one. */
  initial: string;
  avatarUrl: string | null;
  /** `bid` leading slot: the jersey thumb (48 x 60). */
  thumbUrl: string | null;
  accessibilityLabel: string;
};

export type InboxSection = {
  title: string;
  /** The count in `mono` beside the heading; null where the heading has none. */
  count: string | null;
  rows: InboxRow[];
};

export type InboxViewModel = {
  /** Null when the Collector has no incoming pending Bud. */
  waiting: InboxSection | null;
  conversations: InboxSection;
  /** Both lists are empty: the screen shows the empty state instead of the sections. */
  empty: boolean;
};

export const WAITING_TITLE = "Venter på dit svar";
export const CONVERSATIONS_TITLE = "Samtaler";

function latestSnippet(latest: CollectionConversationLatest): string {
  switch (latest.kind) {
    case "text":
      return latest.text === "" ? "Ny besked" : latest.text;
    case "image":
      return "Billede";
    case "bid": {
      const amount = `${latest.amountDkk} kr`;
      if (latest.role === "outgoing") {
        switch (latest.status) {
          case "pending":
            return `Dit bud på ${amount} · Afventer svar`;
          case "accepted":
            return `Bud accepteret · ${amount}`;
          case "declined":
            return `Bud afvist · ${amount}`;
        }
      }
      switch (latest.status) {
        case "pending":
          return `Bud på ${amount} · Afventer dit svar`;
        case "accepted":
          return `Du accepterede buddet · ${amount}`;
        case "declined":
          return `Du afviste buddet · ${amount}`;
      }
    }
  }
}

function accessibilityLabel(parts: string[], unread: boolean): string {
  return [...parts, ...(unread ? ["ulæst"] : [])].join(", ");
}

function waitingRow(bid: CollectionWaitingBid, formatTime: (iso: string) => string): InboxRow {
  const jerseyLine = `${bid.jersey.clubLabel} ${bid.jersey.seasonLabel} · ${bid.jersey.type}`;
  const snippet = `Bud på ${bid.amountDkk} kr`;
  const timeLabel = formatTime(bid.createdAt);

  return {
    variant: "bid",
    key: bid.messageId,
    conversationId: bid.conversationId,
    messageId: bid.messageId,
    handle: bid.bidderHandle,
    snippet,
    jerseyLine,
    timeLabel,
    // Venter på dit svar holds actions, not messages: unread belongs to the Conversation.
    unread: false,
    initial: bid.bidderHandle.charAt(0).toUpperCase(),
    avatarUrl: null,
    thumbUrl: bid.thumbUrl,
    accessibilityLabel: accessibilityLabel(
      [bid.bidderHandle, jerseyLine, snippet, timeLabel],
      false,
    ),
  };
}

function personRow(
  conversation: CollectionConversation,
  formatTime: (iso: string) => string,
): InboxRow {
  const snippet = latestSnippet(conversation.latest);
  const timeLabel = formatTime(conversation.updatedAt);

  return {
    variant: "person",
    key: conversation.id,
    conversationId: conversation.id,
    messageId: null,
    handle: conversation.peerHandle,
    snippet,
    jerseyLine: null,
    timeLabel,
    unread: conversation.unread,
    initial: conversation.peerInitial,
    avatarUrl: conversation.peerAvatarUrl,
    thumbUrl: null,
    accessibilityLabel: accessibilityLabel(
      [conversation.peerHandle, snippet, timeLabel],
      conversation.unread,
    ),
  };
}

export function buildInbox(
  response: Pick<CollectionConversations, "waiting" | "conversations">,
  formatTime: (iso: string) => string,
): InboxViewModel {
  const waiting: InboxSection | null =
    response.waiting.length === 0
      ? null
      : {
          title: WAITING_TITLE,
          count: String(response.waiting.length),
          rows: response.waiting.map((bid) => waitingRow(bid, formatTime)),
        };

  return {
    waiting,
    conversations: {
      title: CONVERSATIONS_TITLE,
      count: null,
      rows: response.conversations.map((conversation) => personRow(conversation, formatTime)),
    },
    empty: response.waiting.length === 0 && response.conversations.length === 0,
  };
}
