import { appLink } from "../links.js";
import type { MailDefinition } from "../template/types.js";
import { gap } from "./account-copy.js";
import { bidFooter, formatBidAmount } from "./bid-copy.js";

export type BidNewMailData = {
  club: string;
  /** Type · season, as the lock's Jersey part shows it. */
  meta: string;
  photoUrl?: string;
  amountDkk: number;
  bidderHandle: string;
  /** Only when the bidder shares their city (Vis by). */
  bidderCity?: string;
  conversationId: string;
  messageId: string;
};

/**
 * Mail 05, new bid, to the jersey owner (docs/design-system.md → Transactional e-mail): board 1,
 * body Jersey, Fact rows Bud (mono) and Fra, button Se buddet. Subject and headline come from the
 * lock. The preheader, the supporting line and the footer reason are not drawn: flagged gaps.
 */
export const bidNewMail: MailDefinition<BidNewMailData> = {
  board: 1,
  subject: () => "Nyt bud på din trøje",
  preheader: () => gap("underlinje"),
  headline: "Nyt bud på din trøje",
  supportingLine: () => gap("underlinje"),
  parts: ({ club, meta, photoUrl, amountDkk, bidderHandle, bidderCity }) => [
    { part: "jersey", club, meta, photoUrl },
    {
      part: "factRows",
      rows: [
        { label: "Bud", value: formatBidAmount(amountDkk), mono: true },
        { label: "Fra", value: bidderCity ? `${bidderHandle} · ${bidderCity}` : bidderHandle },
      ],
    },
  ],
  button: {
    label: "Se buddet",
    target: ({ conversationId, messageId }) => appLink.conversationAtBid(conversationId, messageId),
  },
  footerReason: bidFooter,
};
