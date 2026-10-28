import type { MailKind } from "./mail-event.js";

/** `always` mails are never switched off; the others follow one e-mail switch of the Collector. */
export type MailRule = "always" | "bidsAndMessages" | "wishMatches";

/**
 * The twelve mails of the e-mail lock, and the legacy password-era kinds, each with its rule.
 * An event added to `MailEvent` must be classified here or this file does not compile.
 */
export const MAIL_PREFERENCE = {
  // 01–04, 12: account mails
  code: "always",
  "email-change-code": "always",
  "email-changed": "always",
  "account-deleted": "always",
  "jersey-taken-down": "always",
  // 05–08
  "bid-new": "bidsAndMessages",
  "bid-accepted": "bidsAndMessages",
  "bid-declined": "bidsAndMessages",
  "message-new": "bidsAndMessages",
  // 09–11
  "wish-match": "wishMatches",
  "trial-ending": "wishMatches",
  "plus-expired": "wishMatches",
  // Password-era mail, kept only while the admin app signs in through the API.
  verify: "always",
  reset: "always",
} as const satisfies Record<MailKind, MailRule> & Record<string, MailRule>;

export type ClassifiedMailKind = keyof typeof MAIL_PREFERENCE;
