import * as Crypto from "expo-crypto";
import { branchFromPhotoCount, createCaptureSession, setDraftClub } from "./captureSession";
import { createSqliteCaptureSessionStore } from "./captureSessionSqliteStore";
import type { CaptureBranch, CaptureSessionState } from "./captureSessionTypes";

export type PrefilledClub = {
  id: string;
  label: string;
};

export function createPersistedCaptureSession(
  orderedUris: string[],
  options?: { prefilledClub?: PrefilledClub | null; sessionId?: string },
): { sessionId: string; branch: CaptureBranch } {
  const sessionId = options?.sessionId ?? Crypto.randomUUID();
  const store = createSqliteCaptureSessionStore(sessionId);
  let state = createCaptureSession(orderedUris, { store, sessionId });

  if (options?.prefilledClub) {
    state = setDraftClub(
      state,
      state.activeDraftId,
      options.prefilledClub.id,
      options.prefilledClub.label,
    );
  }

  return { sessionId, branch: state.branch };
}

export function loadPersistedCaptureSession(sessionId: string): CaptureSessionState | null {
  return createSqliteCaptureSessionStore(sessionId).load();
}

export function withPersistedCaptureSession(
  sessionId: string,
  state: CaptureSessionState,
): CaptureSessionState {
  const store = createSqliteCaptureSessionStore(sessionId);
  return { ...state, store };
}

export function clearPersistedCaptureSession(sessionId: string): void {
  createSqliteCaptureSessionStore(sessionId).clear();
}

export function isBulkUpload(photoCount: number): boolean {
  return branchFromPhotoCount(photoCount) === "bulk";
}
