import { useEffect, useState } from "react";
import { draftDb } from "@/drafts/db";
import { type ParkedRowModel, parkedRow } from "./captureOverview";
import { parkSession, unparkSession } from "./captureSession";
import { createSqliteCaptureSessionStore } from "./captureSessionSqliteStore";
import type { CaptureSessionMutator } from "./captureSessionTypes";

/**
 * Gør resten færdig senere keeps one capture session and shows it as a single row in Samling
 * (docs/design-system.md, Capture session, Revision 2026-10-09, item 3). At most one session is
 * parked; the row goes when the session is finished or discarded.
 */

const listeners = new Set<() => void>();

/** Park, finish and discard all call this so Samling re-reads without waiting for a focus event. */
export function notifyParkedSessionChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}

function newestParkedSessionId(): string | null {
  const row = draftDb.getFirstSync<{ id: string }>(
    `SELECT id FROM capture_session WHERE parked_at IS NOT NULL ORDER BY parked_at DESC LIMIT 1`,
  );
  return row?.id ?? null;
}

export function readParkedRow(now: number = Date.now()): ParkedRowModel | null {
  const sessionId = newestParkedSessionId();
  if (!sessionId) {
    return null;
  }
  const state = createSqliteCaptureSessionStore(sessionId).load();
  return state ? parkedRow(state, now) : null;
}

/** Park this session and unpark every other one, so Samling never shows two rows. */
export function parkOverviewSession(mutate: CaptureSessionMutator, sessionId: string): void {
  const parked = mutate((current) => parkSession(current, Date.now()));
  if (parked) {
    draftDb.runSync(
      `UPDATE capture_session SET parked_at = NULL WHERE id != ? AND parked_at IS NOT NULL`,
      [sessionId],
    );
  }
  notifyParkedSessionChanged();
}

/** The collector reopened the overview: the row goes while they are in it. */
export function unparkOverviewSession(mutate: CaptureSessionMutator): void {
  mutate((current) => unparkSession(current));
  notifyParkedSessionChanged();
}

export function useParkedRow(): ParkedRowModel | null {
  const [row, setRow] = useState<ParkedRowModel | null>(() => readParkedRow());

  useEffect(() => {
    const refresh = () => setRow(readParkedRow());
    listeners.add(refresh);
    refresh();
    return () => {
      listeners.delete(refresh);
    };
  }, []);

  return row;
}
