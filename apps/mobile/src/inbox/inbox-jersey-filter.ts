import type { CollectionConversation, CollectionWaitingBid } from "@kit/api-contract";

export type InboxJerseyFilterResult = {
  waiting: CollectionWaitingBid[];
  conversations: CollectionConversation[];
  /** Club and season of the first matching Bud; null when no filter or no match. */
  kitLine: string | null;
};

/**
 * Indbakke filtered to one UserJersey (the own jersey detail's bid row with several bidders).
 * Conversations carry no jersey id, so a Conversation belongs to the jersey when a waiting Bud
 * on it does; the filter therefore shows the jersey's pending Buds, which is what that bid row
 * counts. With no jersey id the lists pass through untouched.
 */
export function filterInboxByJersey(
  inbox: { waiting: CollectionWaitingBid[]; conversations: CollectionConversation[] },
  jerseyId: string | null | undefined,
): InboxJerseyFilterResult {
  if (!jerseyId) {
    return { waiting: inbox.waiting, conversations: inbox.conversations, kitLine: null };
  }

  const matching = inbox.waiting.filter((bid) => bid.userJerseyId === jerseyId);
  const conversationIds = new Set(matching.map((bid) => bid.conversationId));
  const first = matching[0];

  return {
    waiting: matching,
    conversations: inbox.conversations.filter((item) => conversationIds.has(item.id)),
    kitLine: first ? `${first.jersey.clubLabel} ${first.jersey.seasonLabel}` : null,
  };
}
