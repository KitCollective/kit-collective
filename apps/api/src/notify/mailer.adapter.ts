/** One finished mail. Notify builds it; an adapter only delivers it. */
export type OutboundMail = {
  to: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

export interface MailerAdapter {
  send(mail: OutboundMail): Promise<void>;
}
