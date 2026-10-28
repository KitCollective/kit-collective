import { appLink } from "../links.js";
import type { MailDefinition } from "../template/types.js";
import { gap } from "./account-copy.js";
import { bidFooter, formatBidAmount } from "./bid-copy.js";

type BidDeclinedFacts = {
  club: string;
  /** Type · season, as the lock's Jersey part shows it. */
  meta: string;
  photoUrl?: string;
  amountDkk: number;
  ownerHandle: string;
};

export type BidDeclinedMailData = BidDeclinedFacts & { userJerseyId: string };
export type BidGoneMailData = BidDeclinedFacts & { line: string };

const parts = ({ club, meta, photoUrl, amountDkk, ownerHandle }: BidDeclinedFacts) => [
  { part: "jersey" as const, club, meta, photoUrl },
  {
    part: "factRows" as const,
    rows: [
      { label: "Bud", value: formatBidAmount(amountDkk), mono: true },
      { label: "Ejer", value: ownerHandle },
    ],
  },
];

/**
 * Mail 07, bid declined by the owner, to the bidder (docs/design-system.md → Transactional e-mail):
 * board 1, body Jersey, Fact rows Bud (mono) and Ejer, button Send nyt bud. The preheader, the
 * supporting line and the footer reason are not drawn: flagged gaps.
 */
export const bidDeclinedMail: MailDefinition<BidDeclinedMailData> = {
  board: 1,
  subject: () => "Dit bud er afvist",
  preheader: () => gap("underlinje"),
  headline: "Dit bud er afvist",
  supportingLine: () => gap("underlinje"),
  parts,
  button: {
    label: "Send nyt bud",
    target: ({ userJerseyId }) => appLink.sendBid(userJerseyId),
  },
  footerReason: bidFooter,
};

/** The line the lock gives for a bid declined because the jersey went to someone else. */
export const WENT_TO_ANOTHER_LINE = "Trøjen er gået til en anden samler.";

/**
 * Mail 07's variant for a bid declined without the owner answering it: no button, because there is
 * nothing to bid on. The line comes from the caller's reason, never from a shared sentence: the
 * lock words only the "went to another collector" case.
 */
export const bidGoneMail: MailDefinition<BidGoneMailData> = {
  board: 1,
  subject: () => "Dit bud er afvist",
  preheader: () => gap("underlinje"),
  headline: "Dit bud er afvist",
  supportingLine: ({ line }) => line,
  parts,
  footerReason: bidFooter,
};
