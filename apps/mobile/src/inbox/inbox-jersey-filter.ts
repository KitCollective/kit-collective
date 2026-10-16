import type { CollectionActivityItem, CollectionConversation } from "@kit/api-contract";

export type InboxJerseyFilterResult = {
  conversations: CollectionConversation[];
  activityItems: CollectionActivityItem[];
  /** Kit line of the first matching activity item; null when no filter or no match. */
  kitLine: string | null;
};

/**
 * Indbakke filtered to one UserJersey (the own jersey detail's bid row with several bidders).
 * Conversations carry no jersey id, so a conversation belongs to the jersey when one of its
 * activity items does. With no jersey id the lists pass through untouched.
 */
export function filterInboxByJersey(
  conversations: CollectionConversation[],
  activityItems: CollectionActivityItem[],
  jerseyId: string | null | undefined,
): InboxJerseyFilterResult {
  if (!jerseyId) {
    return { conversations, activityItems, kitLine: null };
  }

  const matching = activityItems.filter((item) => item.userJerseyId === jerseyId);
  const conversationIds = new Set(matching.map((item) => item.conversationId));

  return {
    conversations: conversations.filter((item) => conversationIds.has(item.id)),
    activityItems: matching,
    kitLine: matching[0]?.kitLine ?? null,
  };
}
