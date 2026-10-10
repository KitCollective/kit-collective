import { useEffect, useState } from "react";
import type { ParkedRowModel } from "./captureOverview";
import {
  createSqliteCaptureSessionStore,
  newestParkedSessionId,
  unparkOtherSessions,
} from "./captureSessionSqliteStore";
import { createParkedSessions } from "./parkedSessions";

const parked = createParkedSessions({
  open: createSqliteCaptureSessionStore,
  newestParkedSessionId,
  unparkOtherSessions,
});

export const notifyParkedSessionChanged = parked.notify;
export const parkSessionById = parked.park;
export const unparkSessionById = parked.unpark;
export const leaveOverviewSession = parked.leave;

export function useParkedRow(): ParkedRowModel | null {
  const [row, setRow] = useState<ParkedRowModel | null>(() => parked.readRow());

  useEffect(() => {
    const refresh = () => setRow(parked.readRow());
    const unsubscribe = parked.subscribe(refresh);
    refresh();
    return unsubscribe;
  }, []);

  return row;
}
