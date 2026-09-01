export const MAIL_KINDS = ["verify", "reset"] as const;

export type MailKind = (typeof MAIL_KINDS)[number];

export type OutboundMail = {
  to: string;
  kind: MailKind;
  subject: string;
  url: string;
};

export interface MailerAdapter {
  send(mail: OutboundMail): Promise<void>;
}
