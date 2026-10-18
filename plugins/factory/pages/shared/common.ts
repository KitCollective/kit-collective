// Constants and helpers several pages use.
import type { InboxCardDto } from "../../src/shared/contract";

/** The nav panel path of the Inbox page; Home opens it at a card with the card's id as sub-path. */
export const INBOX = "inbox";

/** The colour of a card's kind, in the Inbox list and on Home. */
export const DOT: Record<InboxCardDto["kind"], string> = {
  review: "bg-emerald-500",
  question: "bg-amber-500",
  mention: "bg-sky-500",
  alarm: "bg-red-500",
  landing: "bg-sky-500",
};

/** The nav panel path of the Agents page; its Board and Runs views are sub-paths of it. */
export const PANEL = "agents";

export const field =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export const when = (at: number) =>
  new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
