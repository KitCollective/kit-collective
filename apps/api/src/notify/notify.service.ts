import type { Db } from "@kit/db";
import { Inject, Injectable } from "@nestjs/common";
import { DB } from "../db/db.module.js";
import { composeMail } from "./kinds/registry.js";
import type { MailEvent } from "./mail-event.js";
import { type ClassifiedMailKind, MAIL_PREFERENCE } from "./mail-preference.js";
import type { MailerAdapter } from "./mailer.adapter.js";
import { MAILER } from "./mailer.token.js";
import { loadNotificationPrefs } from "./notification-prefs.js";

/** The one place that builds mail. Callers say what happened; Notify decides what the mail is. */
@Injectable()
export class NotifyService {
  constructor(
    @Inject(MAILER) private readonly mailer: MailerAdapter,
    @Inject(DB) private readonly db: Db,
  ) {}

  async send(event: MailEvent): Promise<void> {
    const { subject, preheader, html, text } = composeMail(event);
    await this.mailer.send({ to: event.to, subject, preheader, html, text });
  }

  /** Whether a mail of this kind should go to this Collector, by their e-mail switches. */
  async shouldSend(kind: ClassifiedMailKind, recipientUserId: string): Promise<boolean> {
    const rule = MAIL_PREFERENCE[kind];
    // Answered before any read: the "account deleted" mail goes out after the user row is gone.
    if (rule === "always") {
      return true;
    }
    const prefs = await loadNotificationPrefs(this.db, recipientUserId);
    return prefs.email[rule];
  }
}
