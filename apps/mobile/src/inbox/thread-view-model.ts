import type {
  CollectionConversationDetail,
  CollectionConversationMessage,
  CollectionConversationPeer,
  CollectionSendMessageRequest,
} from "@kit/api-contract";
import { JERSEY_SIZE_LABELS_DA, KIT_TYPE_LABELS_DA } from "@kit/domain";

/**
 * Pure thread view-model (docs/design-system.md → Conversation and Bid card, Revision
 * 2026-10-10): the Conversation detail in, the column's items out. No React Native import,
 * so it is tested without rendering.
 *
 * Wording the lock does not give (Conversation → Gaps), kept to the KIT-297 plan and flagged
 * for /to-design: the bidder's mirrored accept line, nothing on the owner's side of a
 * `jersey_gone` line, the "no longer available" line, and no line after a plain decline.
 */

type Message = CollectionConversationMessage;
type MessageJersey = NonNullable<Message["jersey"]>;

const JERSEY_UNAVAILABLE_LABEL = "Trøjen er ikke længere tilgængelig";
const JERSEY_GONE_LINE = "Trøjen er gået til en anden samler.";
const PENDING_LABEL = "Afventer svar";
const REFERENCE_CAPTION = "Om trøjen";
const REFERENCE_DISMISS_NAME = "Fjern trøjen";

export type BidCardStatus =
  | { kind: "pending-sender"; label: string }
  | { kind: "accepted"; label: string }
  | { kind: "declined"; label: string };

export type BidCardJersey = {
  /** Club and season, as the Bud was sent. */
  title: string;
  /** Type · size. */
  meta: string;
  /** Relative /v1 path of the first showcase photo; null when the jersey is gone or private. */
  thumbPath: string | null;
  /** Where the jersey row goes; null when the jersey is gone or private (the row does not open). */
  href: string | null;
  unavailableLabel: string | null;
};

export type BidCardState = {
  align: "start" | "end";
  jersey: BidCardJersey | null;
  whoLine: string;
  /** Digits only; the card sets **kr** apart. */
  amount: string;
  actions: "answer" | "none";
  status: BidCardStatus | null;
  sendNewBidHref: string | null;
  accessibility: {
    card: string;
    accept: string;
    decline: string;
    sendNewBid: string;
    jerseyRow: string | null;
  };
};

/** The jersey a text or image message is about, shown read-only above the bubble. */
export type BubbleReference = {
  caption: string;
  label: string;
  /** Relative /v1 path of the jersey's first showcase photo; null once the jersey is gone or private. */
  thumbPath: string | null;
};

export type ThreadItem =
  | { type: "date"; id: string; label: string }
  | { type: "bubble"; id: string; message: Message; reference: BubbleReference | null }
  | { type: "bid"; id: string; card: BidCardState }
  | { type: "system"; id: string; text: string };

export function headerInitial(handle: string): string {
  return handle.charAt(0).toUpperCase();
}

function formatDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function jerseyTitle(jersey: MessageJersey): string {
  return `${jersey.clubLabel} ${jersey.seasonLabel}`;
}

function bubbleReference(jersey: MessageJersey): BubbleReference {
  return {
    caption: REFERENCE_CAPTION,
    label: jerseyTitle(jersey),
    thumbPath: jersey.userJerseyId ? jersey.thumbUrl : null,
  };
}

function bidCardJersey(jersey: MessageJersey, role: Message["role"]): BidCardJersey {
  const id = jersey.userJerseyId;
  // The incoming Bud is on the viewer's own jersey; the outgoing one on the peer's.
  const href = id
    ? role === "incoming"
      ? `/(tabs)/collection/${id}`
      : `/(tabs)/search/${id}`
    : null;
  return {
    title: jerseyTitle(jersey),
    meta: `${KIT_TYPE_LABELS_DA[jersey.type]} · ${JERSEY_SIZE_LABELS_DA[jersey.size]}`,
    thumbPath: id ? jersey.thumbUrl : null,
    href,
    unavailableLabel: id ? null : JERSEY_UNAVAILABLE_LABEL,
  };
}

function bidStatus(message: Message): BidCardStatus | null {
  switch (message.bidStatus) {
    case "accepted":
      return { kind: "accepted", label: "Accepteret" };
    case "declined":
      return { kind: "declined", label: "Afvist" };
    default:
      return message.role === "outgoing" ? { kind: "pending-sender", label: PENDING_LABEL } : null;
  }
}

export function bidCardState(message: Message, peerHandle: string): BidCardState {
  const incoming = message.role === "incoming";
  const pending = (message.bidStatus ?? "pending") === "pending";
  const jersey = message.jersey ? bidCardJersey(message.jersey, message.role) : null;
  const status = bidStatus(message);
  const amount = String(message.bidAmountDkk ?? "");
  const whoLine = incoming ? `${peerHandle} byder på din trøje` : "Du bød";

  // The contract sets openForBid false once the jersey is gone or private.
  const openJerseyId = message.jersey?.openForBid ? message.jersey.userJerseyId : null;
  const sendNewBidHref =
    !incoming && message.bidStatus === "declined" && openJerseyId
      ? `/(tabs)/search/send-bid/${openJerseyId}`
      : null;

  const statusLabel = status?.label ?? PENDING_LABEL;
  const jerseyName = jersey ? ` på ${jersey.title}` : "";
  const amountPart = `${amount} kr`;
  const cardParts = [
    incoming ? whoLine : `${whoLine} til ${peerHandle}`,
    ...(jersey ? [jersey.title, jersey.meta] : []),
    ...(jersey?.unavailableLabel ? [jersey.unavailableLabel] : []),
    amountPart,
    statusLabel,
  ];

  return {
    align: incoming ? "start" : "end",
    jersey,
    whoLine,
    amount,
    actions: incoming && pending ? "answer" : "none",
    status,
    sendNewBidHref,
    accessibility: {
      card: cardParts.join(", "),
      accept: `Accepter bud fra ${peerHandle}${jerseyName}, ${amountPart}, ${statusLabel}`,
      decline: `Afvis bud fra ${peerHandle}${jerseyName}, ${amountPart}, ${statusLabel}`,
      sendNewBid: `Send nyt bud til ${peerHandle}${jerseyName}, ${amountPart}, ${statusLabel}`,
      jerseyRow: jersey?.href ? `Åbn trøjen ${jersey.title}, ${jersey.meta}` : null,
    },
  };
}

/** The centred line for a system message, worded for the viewer's side; null when that side gets none. */
function systemLineText(message: Message, peerHandle: string): string | null {
  const amount = message.bidAmountDkk ? ` på ${message.bidAmountDkk} kr` : "";
  switch (message.systemReason) {
    case "bid_accepted":
      // The sender of a system line is the jersey's owner.
      return message.role === "outgoing"
        ? `Du accepterede buddet${amount}. Aftal betaling og levering med ${peerHandle} her i tråden.`
        : `${peerHandle} accepterede dit bud${amount}. Aftal betaling og levering med ${peerHandle} her i tråden.`;
    case "jersey_gone":
      return message.role === "incoming" ? JERSEY_GONE_LINE : null;
    default:
      return null;
  }
}

export function threadItems(detail: CollectionConversationDetail): ThreadItem[] {
  const items: ThreadItem[] = [];
  let lastDateKey: string | null = null;

  for (const message of detail.messages) {
    let item: ThreadItem | null;
    if (message.kind === "system") {
      const text = systemLineText(message, detail.peerHandle);
      item = text ? { type: "system", id: message.id, text } : null;
    } else if (message.kind === "bid") {
      item = { type: "bid", id: message.id, card: bidCardState(message, detail.peerHandle) };
    } else {
      item = {
        type: "bubble",
        id: message.id,
        message,
        reference: message.jersey ? bubbleReference(message.jersey) : null,
      };
    }

    if (!item) {
      continue;
    }

    const dateKey = message.createdAt.slice(0, 10);
    if (dateKey !== lastDateKey) {
      items.push({
        type: "date",
        id: `date-${dateKey}`,
        label: formatDateLabel(message.createdAt),
      });
      lastDateKey = dateKey;
    }
    items.push(item);
  }

  return items;
}

/** Index of the item for a message id, or null: where a waiting Indbakke row opens the thread. */
export function threadItemIndex(items: ThreadItem[], messageId: string | null): number | null {
  if (!messageId) {
    return null;
  }
  const index = items.findIndex((item) => item.id === messageId);
  return index === -1 ? null : index;
}

export type ConversationConfirmCopy = {
  title: string;
  consequence: string;
  confirmLabel: string;
};

export type ConversationMore = {
  profile: { handle: string; meta: string; href: string };
  rows: {
    report: { title: string };
    block: { title: string };
    delete: { title: string };
  };
  caption: string;
  confirm: { block: ConversationConfirmCopy; delete: ConversationConfirmCopy };
  reportedToast: string;
};

const MORE_CAPTION =
  "Blokering skjuler samtalen for jer begge. Slet samtale fjerner den kun for dig — den anden kan stadig se tråden.";

/** Banner text when Rapportér, Blokér, Slet samtale or loading the peer fails. */
export const CONVERSATION_MORE_FAILURE = "Noget gik galt. Prøv igen.";

/** City · n trøjer · Se profil; the city is dropped when the Collector shows none. */
function peerProfileMeta(peer: CollectionConversationPeer): string {
  const jerseys = peer.jerseyCount === 1 ? "1 trøje" : `${peer.jerseyCount} trøjer`;
  return [peer.city, jerseys, "Se profil"].filter(Boolean).join(" · ");
}

/**
 * Conversation → More Sheet (docs/design-system.md, Revision 2026-10-10): the peer in, the
 * Sheet's rows, caption, both `confirm` Sheets and the Rapportér Toast / failure Banner text out.
 */
export function conversationMore(peer: CollectionConversationPeer): ConversationMore {
  const { handle } = peer;
  return {
    profile: {
      handle,
      meta: peerProfileMeta(peer),
      href: `/(tabs)/search/peer/${handle}`,
    },
    rows: {
      report: { title: "Rapportér" },
      block: { title: `Blokér ${handle}` },
      delete: { title: "Slet samtale" },
    },
    caption: MORE_CAPTION,
    confirm: {
      block: {
        title: `Blokér ${handle}?`,
        consequence: `Samtalen med ${handle} skjules for jer begge.`,
        confirmLabel: "Blokér",
      },
      delete: {
        title: "Slet samtalen?",
        consequence: `Samtalen fjernes kun for dig. ${handle} kan stadig se tråden.`,
        confirmLabel: "Slet samtale",
      },
    },
    reportedToast: "Samtalen er rapporteret",
  };
}

function jerseyCountLabel(count: number): string {
  return count === 1 ? "1 trøje" : `${count} trøjer`;
}

export type ThreadStart = {
  handle: string;
  initial: string;
  /** Relative /v1 path of the Collector's photo; null shows the initial. */
  avatarPath: string | null;
  /** City per Vis by · n trøjer; the city is left out when the Collector shows none. */
  meta: string;
};

/**
 * Conversation → Thread start (composition 5, no messages yet): the Handle, the initial or
 * Avatar photo and city · n trøjer of the Collector the thread is with.
 */
export function threadStart(peer: CollectionConversationPeer): ThreadStart {
  return {
    handle: peer.handle,
    initial: headerInitial(peer.handle),
    avatarPath: peer.avatarUrl,
    meta: [peer.city, jerseyCountLabel(peer.jerseyCount)].filter(Boolean).join(" · "),
  };
}

export type JerseyReference = {
  userJerseyId: string;
  /** Relative /v1 path of the jersey's first showcase photo. */
  thumbPath: string | null;
  caption: string;
  /** Club and season. */
  label: string;
  dismissName: string;
  accessibilityLabel: string;
};

/**
 * Message composer → jersey reference (Revision 2026-10-10): the foreign jersey the thread was
 * opened from, shown above the field until it is dismissed or the first message is sent.
 */
export function jerseyReference(jersey: {
  id: string;
  clubLabel: string;
  seasonLabel: string;
  photos: ReadonlyArray<{ photoUrl: string }>;
}): JerseyReference {
  const label = `${jersey.clubLabel} ${jersey.seasonLabel}`;
  return {
    userJerseyId: jersey.id,
    thumbPath: jersey.photos[0]?.photoUrl ?? null,
    caption: REFERENCE_CAPTION,
    label,
    dismissName: REFERENCE_DISMISS_NAME,
    accessibilityLabel: `${REFERENCE_CAPTION}, ${label}`,
  };
}

/**
 * The send body. `userJerseyId` rides along only while the jersey reference is still shown, so a
 * dismissed reference (or one cleared after the first send) is never sent.
 */
export function sendMessageBody(input: {
  text: string;
  imageBase64?: string | null;
  replyToMessageId?: string;
  reference: JerseyReference | null;
}): CollectionSendMessageRequest {
  const text = input.text.trim();
  return {
    ...(text ? { text } : {}),
    ...(input.imageBase64 ? { contentBase64: input.imageBase64 } : {}),
    ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
    ...(input.reference ? { userJerseyId: input.reference.userJerseyId } : {}),
  };
}

/** The thread with a Collector: the one Conversation if any, else the empty thread. */
export function peerThreadHref(peerId: string, aboutJerseyId?: string): string {
  const base = `/(tabs)/inbox/peer/${peerId}`;
  return aboutJerseyId ? `${base}?jerseyId=${aboutJerseyId}` : base;
}

/** Name and label of the foreign jersey's dock control: Skriv til <handle>. */
export function writeToPeerLabel(handle: string): string {
  return `Skriv til ${handle}`;
}
