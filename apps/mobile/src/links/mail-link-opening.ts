import { type MailLinkHref, mailLinkStack } from "@/links/mail-link";
import { takeMailLink } from "@/links/pending-mail-link";

export type MailLinkOpening = { hrefs: MailLinkHref[]; paywall: boolean };

/**
 * Decides whether the held mail link opens now. It opens only when the Collector is signed in and
 * the tabs are showing; before that the target stays held. Taking it clears it, so it opens once.
 */
export function takeMailLinkOpening(state: {
  signedIn: boolean;
  inTabs: boolean;
}): MailLinkOpening | null {
  if (!state.signedIn || !state.inTabs) {
    return null;
  }
  const target = takeMailLink();
  if (!target) {
    return null;
  }
  return { hrefs: mailLinkStack(target), paywall: target.kind === "paywall" };
}
