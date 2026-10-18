/**
 * Pure bid rules for Søg and Send bud (docs/design-system.md → Foreign UserJersey detail, Send bid).
 * No React, no react-native.
 */

/** A bid this Collector has waiting on the jersey. */
export type MyPendingBid = { amountDkk: number; conversationId: string };

/** What the foreign UserJersey detail dock holds. */
export type PeerJerseyDockState =
  | { kind: "send" }
  | { kind: "none" }
  | { kind: "own-pending"; amountDkk: number; conversationId: string };

/**
 * Button dock of the foreign UserJersey detail. A pending bid of this Collector wins: the button is
 * replaced by the own bid row, even when the owner has since closed the jersey for bid (one pending
 * bid per Collector per jersey, no way to bid again while it waits). Otherwise a jersey that is
 * åben for bud docks Send bud; one that is not has no dock for now (the later Skriv til handle
 * control is KIT-298), and Send bud is never offered on it.
 */
export function peerJerseyDockState(input: {
  biddingEnabled: boolean;
  myPendingBid: MyPendingBid | null;
}): PeerJerseyDockState {
  if (input.myPendingBid) {
    return {
      kind: "own-pending",
      amountDkk: input.myPendingBid.amountDkk,
      conversationId: input.myPendingBid.conversationId,
    };
  }
  return input.biddingEnabled ? { kind: "send" } : { kind: "none" };
}

/** Whole kroner only: digits, no decimals (a separator is dropped), no leading zero. */
export function normalizeBidAmountInput(text: string): string {
  return text.replace(/\D/g, "").replace(/^0+/, "");
}

/** Button label: carries the whole-kroner amount, or plain "Send bud" without one. */
export function sendBidButtonLabel(amountText: string): string {
  const amount = Number.parseInt(amountText, 10);
  return Number.isInteger(amount) && amount >= 1 ? `Send bud på ${amount} kr` : "Send bud";
}

/** The Send bud button: the amount on the label, disabled until the amount is above zero. */
export function sendBidButton(amountText: string): { label: string; disabled: boolean } {
  const amount = Number.parseInt(amountText, 10);
  return {
    label: sendBidButtonLabel(amountText),
    disabled: !(Number.isInteger(amount) && amount >= 1),
  };
}

/** Copy of the own bid row in the dock: Dit bud, the amount, Afventer svar. */
export function ownBidRowCopy(amountDkk: number): {
  title: string;
  amount: string;
  status: string;
  accessibilityLabel: string;
} {
  const title = "Dit bud";
  const amount = `${amountDkk} kr`;
  const status = "Afventer svar";
  return { title, amount, status, accessibilityLabel: `${title}, ${amount}, ${status}` };
}

/** The Toast shown once on the foreign detail after a bid was sent. */
export function bidSentToastMessage(handle: string): string {
  return `Dit bud er sendt til ${handle}`;
}
