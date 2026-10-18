/**
 * Send bud opens from Søg (the foreign detail) and from a Bid card in an Indbakke thread (Send nyt
 * bud). From the thread the Søg stack under Send bud is not where the Collector came from, so the
 * card hands over the path it sits in as `returnTo` (KIT-413).
 */

/** The Send bud href with the in-app path to return to after the send. */
export function sendBidHrefReturningTo(href: string, returnTo: string): string {
  return `${href}?returnTo=${encodeURIComponent(returnTo)}`;
}

export type SendBidExit = { kind: "back" } | { kind: "return"; href: string };

/**
 * Where Send bud goes after a sent Bud. Back unless `returnTo` is one in-app path: a link must not
 * send the Collector to another origin or scheme, so "//host", "/\host" and anything not starting
 * with a single "/" fall back to back.
 */
export function sendBidExit(returnTo: string | string[] | undefined): SendBidExit {
  if (
    typeof returnTo !== "string" ||
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//") ||
    returnTo.startsWith("/\\")
  ) {
    return { kind: "back" };
  }
  return { kind: "return", href: returnTo };
}
