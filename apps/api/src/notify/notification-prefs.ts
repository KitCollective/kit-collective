import {
  NOTIFICATION_PREFS_DEFAULTS,
  type NotificationPrefs,
  type NotificationPrefsUpdate,
} from "@kit/api-contract";
import { type Db, notificationPreference } from "@kit/db";
import { eq } from "drizzle-orm";

/** The stored switches of one Collector, or the defaults when they have never changed one. */
export async function loadNotificationPrefs(db: Db, userId: string): Promise<NotificationPrefs> {
  const [row] = await db
    .select()
    .from(notificationPreference)
    .where(eq(notificationPreference.userId, userId))
    .limit(1);

  if (!row) {
    return NOTIFICATION_PREFS_DEFAULTS;
  }

  return {
    email: {
      bidsAndMessages: row.emailBidsAndMessages,
      wishMatches: row.emailWishMatches,
      news: row.emailNews,
    },
    push: { bids: row.pushBids, messages: row.pushMessages, wishMatches: row.pushWishMatches },
  };
}

/** Merges a partial update into the current switches, stores the whole row and returns it. */
export async function saveNotificationPrefs(
  db: Db,
  userId: string,
  update: NotificationPrefsUpdate,
): Promise<NotificationPrefs> {
  const current = await loadNotificationPrefs(db, userId);
  const merged: NotificationPrefs = {
    email: { ...current.email, ...update.email },
    push: { ...current.push, ...update.push },
  };
  const values = {
    emailBidsAndMessages: merged.email.bidsAndMessages,
    emailWishMatches: merged.email.wishMatches,
    emailNews: merged.email.news,
    pushBids: merged.push.bids,
    pushMessages: merged.push.messages,
    pushWishMatches: merged.push.wishMatches,
    updatedAt: new Date(),
  };

  await db
    .insert(notificationPreference)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: notificationPreference.userId, set: values });

  return merged;
}
