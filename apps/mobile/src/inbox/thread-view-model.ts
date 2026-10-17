import type {
  CollectionConversationDetail,
  CollectionConversationMessage,
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

export type ThreadItem =
  | { type: "date"; id: string; label: string }
  | { type: "bubble"; id: string; message: Message }
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
      item = { type: "bubble", id: message.id, message };
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
