import { gap } from "./account-copy.js";

/** A Bud amount as the app shows it (`400 kr`). Mails show it in the body, never in subject or preheader. */
export const formatBidAmount = (amountDkk: number) => `${amountDkk} kr`;

/** Bid mails (05–08) follow Bud og beskeder under Notifikationer; the lock gives no sentence. */
export const bidFooter = gap("fodnotens årsag");
