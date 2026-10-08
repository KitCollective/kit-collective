import type { MailerAdapter, OutboundMail } from "./mailer.adapter.js";

/**
 * SES adapter owned by Notify. Identity must not import this file.
 * Live send lands when SES_FROM and AWS credentials are in the lane environment.
 */
export class SesMailerAdapter implements MailerAdapter {
  async send(_mail: OutboundMail): Promise<void> {
    const from = process.env.SES_FROM?.trim();
    if (!from) {
      throw new Error("SES_FROM is required for the SES mailer");
    }
    throw new Error("SES send is not wired without AWS credentials in this lane");
  }
}
