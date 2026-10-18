import type {
  CollectionConversationDetail,
  CollectionConversationMessage,
  CollectionConversationPeer,
} from "@kit/api-contract";
import { describe, expect, it } from "vitest";
import {
  bidCardState,
  conversationMore,
  headerInitial,
  type ThreadItem,
  threadItems,
} from "../src/inbox/thread-view-model";

const JERSEY_ID = "44444444-4444-4444-8444-444444444444";
const PEER = "mikkel_fck";

function jersey(
  overrides: Partial<NonNullable<CollectionConversationMessage["jersey"]>> = {},
): NonNullable<CollectionConversationMessage["jersey"]> {
  return {
    userJerseyId: JERSEY_ID,
    thumbUrl: "/v1/collection/showcase/photos/55555555-5555-4555-8555-555555555555",
    openForBid: true,
    clubLabel: "Brøndby IF",
    seasonLabel: "2023/24",
    type: "away",
    size: "l",
    ...overrides,
  };
}

function bid(
  overrides: Partial<CollectionConversationMessage> = {},
): CollectionConversationMessage {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "bid",
    role: "incoming",
    bidAmountDkk: 300,
    bidStatus: "pending",
    createdAt: "2026-10-17T10:00:00.000Z",
    jersey: jersey(),
    ...overrides,
  };
}

function detail(messages: CollectionConversationMessage[]): CollectionConversationDetail {
  return {
    id: "99999999-9999-4999-8999-999999999999",
    peerHandle: PEER,
    messages,
  };
}

describe("bidCardState (Bid card, Revision 2026-10-10)", () => {
  it("gives an incoming pending Bud the answer actions, start-aligned", () => {
    const card = bidCardState(bid(), PEER);

    expect(card.align).toBe("start");
    expect(card.actions).toBe("answer");
    expect(card.status).toBeNull();
    expect(card.whoLine).toBe("mikkel_fck byder på din trøje");
  });

  it("gives the sender's pending Bud Afventer svar, no actions, end-aligned", () => {
    const card = bidCardState(bid({ role: "outgoing" }), PEER);

    expect(card.align).toBe("end");
    expect(card.actions).toBe("none");
    expect(card.status).toEqual({ kind: "pending-sender", label: "Afventer svar" });
    expect(card.whoLine).toBe("Du bød");
  });

  it("shows an answered Bud's status and no actions, on both sides", () => {
    expect(bidCardState(bid({ bidStatus: "accepted" }), PEER)).toMatchObject({
      actions: "none",
      status: { kind: "accepted", label: "Accepteret" },
    });
    expect(bidCardState(bid({ bidStatus: "declined" }), PEER)).toMatchObject({
      actions: "none",
      status: { kind: "declined", label: "Afvist" },
    });
    expect(bidCardState(bid({ role: "outgoing", bidStatus: "accepted" }), PEER)).toMatchObject({
      actions: "none",
      status: { kind: "accepted", label: "Accepteret" },
    });
  });

  it("gives the bidder of a declined Bud Send nyt bud while the jersey is åben for bud", () => {
    const card = bidCardState(bid({ role: "outgoing", bidStatus: "declined" }), PEER);

    expect(card.sendNewBidHref).toBe(`/(tabs)/search/send-bid/${JERSEY_ID}`);
  });

  it("gives no Send nyt bud when the jersey is closed, unavailable, or the Bud is not the viewer's", () => {
    const closed = bid({
      role: "outgoing",
      bidStatus: "declined",
      jersey: jersey({ openForBid: false }),
    });
    const gone = bid({
      role: "outgoing",
      bidStatus: "declined",
      jersey: jersey({ userJerseyId: null, thumbUrl: null, openForBid: false }),
    });
    const incomingDeclined = bid({ role: "incoming", bidStatus: "declined" });
    const outgoingPending = bid({ role: "outgoing", bidStatus: "pending" });

    expect(bidCardState(closed, PEER).sendNewBidHref).toBeNull();
    expect(bidCardState(gone, PEER).sendNewBidHref).toBeNull();
    expect(bidCardState(incomingDeclined, PEER).sendNewBidHref).toBeNull();
    expect(bidCardState(outgoingPending, PEER).sendNewBidHref).toBeNull();
  });

  it("opens the jersey on the viewer's side: the owner's Samling, the bidder's Søg", () => {
    expect(bidCardState(bid({ role: "incoming" }), PEER).jersey?.href).toBe(
      `/(tabs)/collection/${JERSEY_ID}`,
    );
    expect(bidCardState(bid({ role: "outgoing" }), PEER).jersey?.href).toBe(
      `/(tabs)/search/${JERSEY_ID}`,
    );
  });

  it("starts with the jersey row: club and season, type · size, thumb", () => {
    const card = bidCardState(bid(), PEER);

    expect(card.jersey).toMatchObject({
      title: "Brøndby IF 2023/24",
      meta: "Ude · L",
      thumbPath: "/v1/collection/showcase/photos/55555555-5555-4555-8555-555555555555",
      unavailableLabel: null,
    });
  });

  it("keeps the snapshot text of a deleted or private jersey, says it is unavailable and does not open", () => {
    const card = bidCardState(
      bid({ jersey: jersey({ userJerseyId: null, thumbUrl: null, openForBid: false }) }),
      PEER,
    );

    expect(card.jersey).toEqual({
      title: "Brøndby IF 2023/24",
      meta: "Ude · L",
      thumbPath: null,
      href: null,
      unavailableLabel: "Trøjen er ikke længere tilgængelig",
    });
  });

  it("shows the amount as a number with kr apart", () => {
    expect(bidCardState(bid({ bidAmountDkk: 1500 }), PEER).amount).toBe("1500");
  });

  it("names the card and its buttons with handle, jersey, amount and status", () => {
    const incoming = bidCardState(bid(), PEER);

    expect(incoming.accessibility.card).toBe(
      "mikkel_fck byder på din trøje, Brøndby IF 2023/24, Ude · L, 300 kr, Afventer svar",
    );
    expect(incoming.accessibility.accept).toBe(
      "Accepter bud fra mikkel_fck på Brøndby IF 2023/24, 300 kr, Afventer svar",
    );
    expect(incoming.accessibility.decline).toBe(
      "Afvis bud fra mikkel_fck på Brøndby IF 2023/24, 300 kr, Afventer svar",
    );

    const declinedMine = bidCardState(bid({ role: "outgoing", bidStatus: "declined" }), PEER);
    expect(declinedMine.accessibility.card).toBe(
      "Du bød til mikkel_fck, Brøndby IF 2023/24, Ude · L, 300 kr, Afvist",
    );
    expect(declinedMine.accessibility.sendNewBid).toBe(
      "Send nyt bud til mikkel_fck på Brøndby IF 2023/24, 300 kr, Afvist",
    );

    const gone = bidCardState(
      bid({ jersey: jersey({ userJerseyId: null, thumbUrl: null, openForBid: false }) }),
      PEER,
    );
    expect(gone.accessibility.card).toContain("Trøjen er ikke længere tilgængelig");
  });
});

describe("threadItems (Conversation, Revision 2026-10-10)", () => {
  const systemAccepted = (role: "incoming" | "outgoing"): CollectionConversationMessage => ({
    id: "22222222-2222-4222-8222-222222222222",
    kind: "system",
    role,
    systemReason: "bid_accepted",
    bidAmountDkk: 300,
    createdAt: "2026-10-17T11:00:00.000Z",
    jersey: jersey({ openForBid: false }),
  });

  const systemGone = (role: "incoming" | "outgoing"): CollectionConversationMessage => ({
    id: "33333333-3333-4333-8333-333333333333",
    kind: "system",
    role,
    systemReason: "jersey_gone",
    bidAmountDkk: 400,
    createdAt: "2026-10-17T11:00:00.000Z",
    jersey: jersey({ openForBid: false }),
  });

  function kinds(items: ThreadItem[]) {
    return items.map((item) => item.type);
  }

  it("puts a centred date before each new day, then bubbles, Bid cards and system lines", () => {
    const items = threadItems(
      detail([
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          kind: "text",
          role: "incoming",
          text: "Hej",
          createdAt: "2026-10-16T09:00:00.000Z",
        },
        bid(),
        systemAccepted("outgoing"),
      ]),
    );

    expect(kinds(items)).toEqual(["date", "bubble", "date", "bid", "system"]);
  });

  it("never renders a system message as a bubble", () => {
    const items = threadItems(
      detail([systemAccepted("outgoing"), systemAccepted("incoming"), systemGone("incoming")]),
    );

    expect(items.some((item) => item.type === "bubble")).toBe(false);
    expect(items.filter((item) => item.type === "system")).toHaveLength(3);
  });

  it("words the accepted line for the owner who accepted", () => {
    const line = threadItems(detail([systemAccepted("outgoing")])).find(
      (item) => item.type === "system",
    );

    expect(line).toMatchObject({
      text: "Du accepterede buddet på 300 kr. Aftal betaling og levering med mikkel_fck her i tråden.",
    });
  });

  it("words the accepted line for the bidder whose Bud was accepted", () => {
    const line = threadItems(detail([systemAccepted("incoming")])).find(
      (item) => item.type === "system",
    );

    expect(line).toMatchObject({
      text: "mikkel_fck accepterede dit bud på 300 kr. Aftal betaling og levering med mikkel_fck her i tråden.",
    });
  });

  it("tells a bidder declined by another accept that the jersey went to another Collector", () => {
    const line = threadItems(detail([systemGone("incoming")])).find(
      (item) => item.type === "system",
    );

    expect(line).toMatchObject({ text: "Trøjen er gået til en anden samler." });
  });

  it("shows the owner no jersey_gone line (lock gap: the owner's side is not worded)", () => {
    const items = threadItems(detail([systemGone("outgoing")]));

    expect(items.filter((item) => item.type === "system")).toHaveLength(0);
  });

  it("gives each Bid card its state", () => {
    const item = threadItems(detail([bid({ role: "outgoing" })])).find(
      (entry) => entry.type === "bid",
    );

    expect(item).toMatchObject({ type: "bid", card: { align: "end", whoLine: "Du bød" } });
  });
});

describe("headerInitial (Conversation header)", () => {
  it("is the first letter of the Handle, upper case", () => {
    expect(headerInitial("mikkel_fck")).toBe("M");
  });
});

describe("conversationMore (Conversation → More Sheet)", () => {
  const peer: CollectionConversationPeer = {
    peerId: "66666666-6666-4666-8666-666666666666",
    handle: PEER,
    jerseyCount: 3,
    city: "København",
  };

  it("builds the profile row: initial, Handle, city · n trøjer · Se profil, Peer Profil href", () => {
    expect(conversationMore(peer).profile).toEqual({
      handle: PEER,
      meta: "København · 3 trøjer · Se profil",
      href: `/(tabs)/search/peer/${PEER}`,
    });
  });

  it("omits the city when absent and says 1 trøje in the singular", () => {
    const { city: _city, ...withoutCity } = peer;

    expect(conversationMore({ ...withoutCity, jerseyCount: 1 }).profile.meta).toBe(
      "1 trøje · Se profil",
    );
    expect(conversationMore({ ...peer, jerseyCount: 0 }).profile.meta).toBe(
      "København · 0 trøjer · Se profil",
    );
  });

  it("names Rapportér, Blokér <handle> and Slet samtale", () => {
    const { rows } = conversationMore(peer);

    expect(rows.report.title).toBe("Rapportér");
    expect(rows.block.title).toBe(`Blokér ${PEER}`);
    expect(rows.delete.title).toBe("Slet samtale");
  });

  it("explains blocking and deleting in the caption", () => {
    expect(conversationMore(peer).caption).toBe(
      "Blokering skjuler samtalen for jer begge. Slet samtale fjerner den kun for dig — den anden kan stadig se tråden.",
    );
  });

  it("asks before Blokér and before Slet samtale, each with a consequence", () => {
    const { confirm } = conversationMore(peer);

    expect(confirm.block).toEqual({
      title: `Blokér ${PEER}?`,
      consequence: `Samtalen med ${PEER} skjules for jer begge.`,
      confirmLabel: "Blokér",
    });
    expect(confirm.delete).toEqual({
      title: "Slet samtalen?",
      consequence: `Samtalen fjernes kun for dig. ${PEER} kan stadig se tråden.`,
      confirmLabel: "Slet samtale",
    });
  });

  it("words the Rapportér Toast", () => {
    expect(conversationMore(peer).reportedToast).toBe("Samtalen er rapporteret");
  });
});
