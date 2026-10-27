import { Inject, Injectable } from "@nestjs/common";
import { composeMail } from "./kinds/registry.js";
import type { MailEvent } from "./mail-event.js";
import type { MailerAdapter } from "./mailer.adapter.js";
import { MAILER } from "./mailer.token.js";

/** The one place that builds mail. Callers say what happened; Notify decides what the mail is. */
@Injectable()
export class NotifyService {
  constructor(@Inject(MAILER) private readonly mailer: MailerAdapter) {}

  async send(event: MailEvent): Promise<void> {
    const { subject, preheader, html, text } = composeMail(event);
    await this.mailer.send({ to: event.to, subject, preheader, html, text });
  }
}
