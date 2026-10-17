import type { Db } from "@kit/db";
import { conversationMessage } from "@kit/db";
import { and, eq } from "drizzle-orm";

/**
 * Declines every pending Bud on one UserJersey, before that UserJersey is deleted.
 * The Conversation and its messages stay; Buds already answered are untouched.
 * Call it inside the transaction that deletes the UserJersey and before the delete:
 * once the row is gone, `user_jersey_id` is null and nothing matches.
 */
export async function declinePendingBudsOnUserJersey(
  db: Pick<Db, "update">,
  userJerseyId: string,
): Promise<void> {
  await db
    .update(conversationMessage)
    .set({ bidStatus: "declined" })
    .where(
      and(
        eq(conversationMessage.userJerseyId, userJerseyId),
        eq(conversationMessage.kind, "bid"),
        eq(conversationMessage.bidStatus, "pending"),
      ),
    );
}
