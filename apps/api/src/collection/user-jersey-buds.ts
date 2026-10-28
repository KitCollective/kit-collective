import type { Db } from "@kit/db";
import { conversationMessage } from "@kit/db";
import { and, eq, ne } from "drizzle-orm";

/** A Bud declined without its owner answering it: who sent it, in which Conversation, for how much. */
export type DeclinedBud = {
  conversationId: string;
  senderId: string;
  bidAmountDkk: number | null;
};

const declinedBud = {
  conversationId: conversationMessage.conversationId,
  senderId: conversationMessage.senderId,
  bidAmountDkk: conversationMessage.bidAmountDkk,
};

/**
 * Declines every pending Bud on one UserJersey, before that UserJersey is deleted.
 * The Conversation and its messages stay; Buds already answered are untouched.
 * Call it inside the transaction that deletes the UserJersey and before the delete:
 * once the row is gone, `user_jersey_id` is null and nothing matches.
 * Returns the declined Buds so the caller can tell each bidder.
 */
export async function declinePendingBudsOnUserJersey(
  db: Pick<Db, "update">,
  userJerseyId: string,
): Promise<DeclinedBud[]> {
  return db
    .update(conversationMessage)
    .set({ bidStatus: "declined" })
    .where(
      and(
        eq(conversationMessage.userJerseyId, userJerseyId),
        eq(conversationMessage.kind, "bid"),
        eq(conversationMessage.bidStatus, "pending"),
      ),
    )
    .returning(declinedBud);
}

/**
 * Declines every other pending Bud on one UserJersey, after the Bud `acceptedMessageId` was
 * accepted. Returns the declined Buds so the caller can tell each of those Conversations.
 */
export async function declineOtherPendingBudsOnUserJersey(
  db: Pick<Db, "update">,
  userJerseyId: string,
  acceptedMessageId: string,
): Promise<DeclinedBud[]> {
  return db
    .update(conversationMessage)
    .set({ bidStatus: "declined" })
    .where(
      and(
        eq(conversationMessage.userJerseyId, userJerseyId),
        eq(conversationMessage.kind, "bid"),
        eq(conversationMessage.bidStatus, "pending"),
        ne(conversationMessage.id, acceptedMessageId),
      ),
    )
    .returning(declinedBud);
}
