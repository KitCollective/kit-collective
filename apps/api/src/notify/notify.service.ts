import type { Db } from "@kit/db";
import { user } from "@kit/db";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DB } from "../db/db.module.js";
import { ModerationService } from "../moderation/moderation.service.js";
import { composeMail } from "./kinds/registry.js";
import type { CollectorMailEvent, MailEvent } from "./mail-event.js";
import { type ClassifiedMailKind, MAIL_PREFERENCE } from "./mail-preference.js";
import type { MailerAdapter } from "./mailer.adapter.js";
import { MAILER } from "./mailer.token.js";
import { loadNotificationPrefs } from "./notification-prefs.js";

/** The one place that builds mail. Callers say what happened; Notify decides what the mail is. */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    @Inject(MAILER) private readonly mailer: MailerAdapter,
    @Inject(DB) private readonly db: Db,
    private readonly moderation: ModerationService,
  ) {}

  async send(event: MailEvent): Promise<void> {
    const { subject, preheader, html, text } = composeMail(event);
    await this.mailer.send({ to: event.to, subject, preheader, html, text });
  }

  /**
   * Composes the mail now and returns the function that delivers it. Delivery never throws: a
   * mailer error is logged by kind alone, so an account action succeeds even when the mail does not.
   */
  prepare(event: MailEvent): () => Promise<void> {
    const { subject, preheader, html, text } = composeMail(event);
    return async () => {
      try {
        await this.mailer.send({ to: event.to, subject, preheader, html, text });
      } catch (error) {
        // Kind and error name only: no address, body or code reaches the log.
        const name = error instanceof Error ? error.name : "unknown error";
        this.logger.warn(`Mail of kind ${event.kind} was not delivered (${name}).`);
      }
    };
  }

  async trySend(event: MailEvent): Promise<void> {
    await this.prepare(event)();
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

  /**
   * The one gate a bid or message mail goes through. Sends nothing when either Collector has
   * blocked the other or the recipient has switched the mail off; otherwise delivers without ever
   * throwing, so the action that caused the mail succeeds even when the mailer does not.
   */
  async notifyCollector(
    event: CollectorMailEvent,
    { recipientId, peerId }: { recipientId: string; peerId: string },
  ): Promise<void> {
    try {
      if (await this.moderation.isBlocked(recipientId, peerId)) {
        return;
      }
      if (!(await this.shouldSend(event.kind, recipientId))) {
        return;
      }
      const [recipient] = await this.db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, recipientId))
        .limit(1);
      if (!recipient) {
        return;
      }
      await this.trySend({ ...event, to: recipient.email });
    } catch (error) {
      const name = error instanceof Error ? error.name : "unknown error";
      this.logger.warn(`Mail of kind ${event.kind} was not sent (${name}).`);
    }
  }
}
