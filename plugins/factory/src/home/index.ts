// The "Venter på dig" section of bb's Home: how many cards the Inbox holds and the newest few. It
// reads the Inbox's own list, so the two never disagree. `createHome` gives the area's RPC handler;
// server.ts builds it and registers it with one line, and src/contract.ts spreads `homeContract`.
//
// bb's plugin API (SDK 0.6) has no way for a plugin to raise a notification, so a new blocking card
// raises none: the section is the only signal.
import type { InboxDto } from "../inbox/contract.js";
import { HOME_CARDS, type HomeDto } from "./contract.js";

/** What Home reads from the Inbox area. */
export interface HomeDeps {
  inbox: { list(): Promise<InboxDto> };
}

export function createHome({ inbox }: HomeDeps) {
  async function waiting(): Promise<HomeDto> {
    const { error, cards } = await inbox.list();
    const newest = [...cards]
      .sort((a, b) => Date.parse(b.since) - Date.parse(a.since) || a.id.localeCompare(b.id))
      .slice(0, HOME_CARDS)
      .map(({ id, identifier, title, kind, since }) => ({ id, identifier, title, kind, since }));
    return { error, count: cards.length, newest };
  }

  return { rpc: { home_waiting: waiting } };
}
