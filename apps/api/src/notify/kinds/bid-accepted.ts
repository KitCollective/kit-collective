import { appLink } from "../links.js";
import type { MailDefinition } from "../template/types.js";
import { gap } from "./account-copy.js";
import { bidFooter, formatBidAmount } from "./bid-copy.js";

export type BidAcceptedMailData = {
  club: string;
  /** Type · season, as the lock's Jersey part shows it. */
  meta: string;
  photoUrl?: string;
  amountDkk: number;
  ownerHandle: string;
  conversationId: string;
};

/**
 * Mail 06, bid accepted, to the bidder (docs/design-system.md → Transactional e-mail): board 1,
 * body Jersey, Fact rows Bud (mono) and Ejer, button Åbn samtalen. The preheader, the supporting
 * line and the footer reason are not drawn: flagged gaps.
 */
export const bidAcceptedMail: MailDefinition<BidAcceptedMailData> = {
  board: 1,
  subject: () => "Dit bud er accepteret",
  preheader: () => gap("underlinje"),
  headline: "Dit bud er accepteret",
  supportingLine: () => gap("underlinje"),
  parts: ({ club, meta, photoUrl, amountDkk, ownerHandle }) => [
    { part: "jersey", club, meta, photoUrl },
    {
      part: "factRows",
      rows: [
        { label: "Bud", value: formatBidAmount(amountDkk), mono: true },
        { label: "Ejer", value: ownerHandle },
      ],
    },
  ],
  button: {
    label: "Åbn samtalen",
    target: ({ conversationId }) => appLink.conversation(conversationId),
  },
  footerReason: bidFooter,
};
