/**
 * The button targets of the mails, on the product domain. Every path carries opaque ids only: no
 * handle, amount or address. The "links" issue (KIT-329) builds the resolver for exactly these
 * paths, so a path changed here must change there.
 */
const DEFAULT_APP_LINK_BASE_URL = "https://kitcollective.app";

function linkBase(): string {
  const base = (process.env.APP_LINK_BASE_URL?.trim() || DEFAULT_APP_LINK_BASE_URL).replace(
    /\/$/,
    "",
  );
  if (!base.startsWith("https://")) {
    throw new Error("APP_LINK_BASE_URL must be an https:// URL.");
  }
  return base;
}

export const appLink = {
  /** The Conversation. */
  conversation: (conversationId: string) => `${linkBase()}/samtale/${conversationId}`,
  /** The Conversation, scrolled to one Bud. */
  conversationAtBid: (conversationId: string, messageId: string) =>
    `${linkBase()}/samtale/${conversationId}/bud/${messageId}`,
  /** Send bud for one UserJersey. */
  sendBid: (userJerseyId: string) => `${linkBase()}/troeje/${userJerseyId}/bud`,
};
