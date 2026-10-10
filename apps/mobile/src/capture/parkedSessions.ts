import { overviewLeaveAction, type ParkedRowModel, parkedRow } from "./captureOverview";
import { parkSession, unparkSession } from "./captureSession";
import type { CaptureSessionStore } from "./captureSessionTypes";

/** What the parked-session logic needs from storage. SQLite on the device, a map in a test. */
export type ParkedSessionStorage = {
  open(sessionId: string): CaptureSessionStore;
  newestParkedSessionId(): string | null;
  unparkOtherSessions(sessionId: string): void;
};

/**
 * Gør resten færdig senere keeps one capture session and shows it as a single row in Samling
 * (docs/design-system.md, Capture session, Revision 2026-10-09, item 3). At most one session is
 * parked; the row goes when the session is finished or discarded. No native import lives here.
 */
export function createParkedSessions(storage: ParkedSessionStorage) {
  const listeners = new Set<() => void>();

  /** Park, finish and discard call this so Samling re-reads without waiting for a focus event. */
  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const readRow = (now: number = Date.now()): ParkedRowModel | null => {
    const sessionId = storage.newestParkedSessionId();
    if (!sessionId) {
      return null;
    }
    const state = storage.open(sessionId).load();
    return state ? parkedRow(state, now) : null;
  };

  const park = (sessionId: string, now: number = Date.now()): void => {
    const store = storage.open(sessionId);
    const state = store.load();
    if (!state) {
      return;
    }
    parkSession({ ...state, store }, now);
    storage.unparkOtherSessions(sessionId);
    notify();
  };

  /** The collector reopened the overview: the row goes while they are in it. */
  const unpark = (sessionId: string): void => {
    const store = storage.open(sessionId);
    const state = store.load();
    if (!state) {
      return;
    }
    unparkSession({ ...state, store });
    notify();
  };

  /**
   * The one exit path of an overview session: Luk, the parked tertiary button, Android back and
   * any other dismissal all end here. Reads the stored session, so it is right even when the
   * screen's own state is stale. Safe to call twice.
   */
  const leave = (sessionId: string): void => {
    const store = storage.open(sessionId);
    const state = store.load();
    if (!state) {
      return;
    }
    if (overviewLeaveAction(state) === "park") {
      park(sessionId);
      return;
    }
    store.clear();
    notify();
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { readRow, park, unpark, leave, notify, subscribe };
}
