// What the Inbox page tells Optio's thread list: that it is open, which message it shows, and when
// the messages changed under it. Both draw in the one app bundle bb loads, so a module-level store
// is shared between them; it holds no data, only that the page is open.
import { useSyncExternalStore } from "react";

interface InboxPanel {
  /** The Inbox page is on screen. */
  open: boolean;
  /** The message it shows (the issue identifier of the card), or null when none is open. */
  messageId: string | null;
  /** Counts the changes the page made to the messages (an answer, a rejection), so the list reads them again. */
  version: number;
}

let panel: InboxPanel = { open: false, messageId: null, version: 0 };
const listeners = new Set<() => void>();

function change(next: Partial<InboxPanel>): void {
  panel = { ...panel, ...next };
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Called by the Inbox page while it is mounted. */
export function setInboxPanel(next: { open: boolean; messageId: string | null }): void {
  change(next);
}

/** The page changed the messages: the list reads them again. */
export function bumpInbox(): void {
  change({ version: panel.version + 1 });
}

export function useInboxPanel(): InboxPanel {
  return useSyncExternalStore(subscribe, () => panel);
}
