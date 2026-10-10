export const MAIL_KINDS = ["verify", "reset", "code"] as const;

export type MailKind = (typeof MAIL_KINDS)[number];

/** A mail the recipient acts on through a link (verify, reset), or by typing a code. */
export type OutboundMail =
  | { to: string; kind: "verify" | "reset"; subject: string; url: string }
  | { to: string; kind: "code"; subject: string; code: string };

export interface MailerAdapter {
  send(mail: OutboundMail): Promise<void>;
}
