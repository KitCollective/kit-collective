import { describe, expect, it } from "vitest";
import { completeOverviewDraft, firstUnsavedDraftId } from "../src/capture/captureOverview";
import {
  applyGroupingSuggestion,
  createCaptureSession,
  markOverviewSession,
} from "../src/capture/captureSession";
import type { CaptureSessionState, CaptureSessionStore } from "../src/capture/captureSessionTypes";
import { createParkedSessions } from "../src/capture/parkedSessions";

const NOW = new Date(2026, 9, 10, 12).getTime();
const YESTERDAY = new Date(2026, 9, 9, 22).getTime();

/** A faithful stand-in for the SQLite store: sessions in a map, the two queries over it. */
function fakeStorage() {
  const sessions = new Map<string, CaptureSessionState>();
  const storage = {
    open: (sessionId: string): CaptureSessionStore => ({
      save: (state) => {
        const { store: _store, ...rest } = state;
        sessions.set(sessionId, structuredClone(rest));
      },
      load: () => {
        const stored = sessions.get(sessionId);
        return stored ? structuredClone(stored) : null;
      },
      clear: () => {
        sessions.delete(sessionId);
      },
    }),
    newestParkedSessionId: () => {
      const parked = [...sessions.entries()]
        .filter(([, state]) => state.parkedAt != null)
        .sort((a, b) => (b[1].parkedAt ?? 0) - (a[1].parkedAt ?? 0));
      return parked[0]?.[0] ?? null;
    },
    unparkOtherSessions: (sessionId: string) => {
      for (const [id, state] of sessions) {
        if (id !== sessionId && state.parkedAt != null) {
          sessions.set(id, { ...state, parkedAt: null });
        }
      }
    },
  };
  return { sessions, storage };
}

function seed(
  sessions: Map<string, CaptureSessionState>,
  name: string,
  photoCount: number,
): CaptureSessionState {
  const uris = Array.from({ length: photoCount }, (_, index) => `file:///${name}-${index}.jpg`);
  let state = createCaptureSession(uris);
  state = applyGroupingSuggestion(
    state,
    {
      groups: [
        {
          photoIds: uris.map((uri) => state.photoIdByUri?.[uri] ?? ""),
          confidence: 95,
        },
      ],
    },
    {},
  );
  state = markOverviewSession(state);
  const { store: _store, ...plain } = state;
  sessions.set(state.sessionId, plain);
  return state;
}

describe("the parked session row", () => {
  it("shows once a session is parked and goes when it is reopened", () => {
    const { sessions, storage } = fakeStorage();
    const parked = createParkedSessions(storage);
    const state = seed(sessions, "a", 4);
    expect(parked.readRow(NOW)).toBeNull();

    parked.park(state.sessionId, YESTERDAY);
    expect(parked.readRow(NOW)).toMatchObject({ title: "1 trøje mangler", pill: "Fortsæt" });

    parked.unpark(state.sessionId);
    expect(parked.readRow(NOW)).toBeNull();
  });

  it("keeps at most one parked session", () => {
    const { sessions, storage } = fakeStorage();
    const parked = createParkedSessions(storage);
    const first = seed(sessions, "a", 4);
    const second = seed(sessions, "b", 5);
    parked.park(first.sessionId, YESTERDAY);
    parked.park(second.sessionId, YESTERDAY + 1);

    expect(sessions.get(first.sessionId)?.parkedAt).toBeNull();
    expect(parked.readRow(NOW)?.sessionId).toBe(second.sessionId);
  });

  it("is gone once the session is finished or discarded", () => {
    const { sessions, storage } = fakeStorage();
    const parked = createParkedSessions(storage);
    const state = seed(sessions, "a", 4);
    parked.park(state.sessionId, YESTERDAY);
    expect(parked.readRow(NOW)).not.toBeNull();

    storage.open(state.sessionId).clear();
    expect(parked.readRow(NOW)).toBeNull();
  });

  it("tells Samling when the row changes", () => {
    const { sessions, storage } = fakeStorage();
    const parked = createParkedSessions(storage);
    const state = seed(sessions, "a", 4);
    let heard = 0;
    const unsubscribe = parked.subscribe(() => {
      heard += 1;
    });

    parked.park(state.sessionId, YESTERDAY);
    parked.leave(state.sessionId);
    unsubscribe();
    parked.park(state.sessionId, YESTERDAY);

    expect(heard).toBe(2);
  });
});

describe("leaving the overview", () => {
  it("parks the session while work is left, however many times and ways the collector leaves", () => {
    const { sessions, storage } = fakeStorage();
    const parked = createParkedSessions(storage);
    const state = seed(sessions, "a", 4);

    parked.leave(state.sessionId);
    parked.leave(state.sessionId);

    expect(sessions.get(state.sessionId)?.parkedAt).not.toBeNull();
    expect(parked.readRow(Date.now())).not.toBeNull();
  });

  it("clears the session and the row when every jersey is saved and no photo is loose", () => {
    const { sessions, storage } = fakeStorage();
    const parked = createParkedSessions(storage);
    const state = seed(sessions, "a", 4);
    const stored = sessions.get(state.sessionId);
    if (!stored) {
      throw new Error("seed failed");
    }
    const firstId = firstUnsavedDraftId(stored);
    if (!firstId) {
      throw new Error("no draft");
    }
    sessions.set(state.sessionId, completeOverviewDraft(stored, firstId));
    parked.park(state.sessionId, YESTERDAY);

    parked.leave(state.sessionId);

    expect(sessions.has(state.sessionId)).toBe(false);
    expect(parked.readRow(NOW)).toBeNull();
  });

  it("does nothing for a session that is already gone", () => {
    const { storage } = fakeStorage();
    const parked = createParkedSessions(storage);
    expect(() => parked.leave("missing")).not.toThrow();
    expect(parked.readRow(NOW)).toBeNull();
  });
});
