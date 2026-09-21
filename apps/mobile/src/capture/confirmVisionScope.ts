export type ConfirmVisionScope = {
  draftId: string | null;
  photoFingerprint: string | null;
};

export function draftPhotoFingerprint(
  draft: { photos: ReadonlyArray<{ uri: string }> } | null | undefined,
): string | null {
  if (!draft || draft.photos.length === 0) {
    return null;
  }

  return draft.photos
    .map((photo) => photo.uri)
    .sort()
    .join("\0");
}

export function confirmVisionScopeFromDraft(
  draft: { id: string; photos: ReadonlyArray<{ uri: string }> } | null | undefined,
): ConfirmVisionScope {
  return {
    draftId: draft?.id ?? null,
    photoFingerprint: draftPhotoFingerprint(draft),
  };
}

/** True when the Confirm screen should reset Vision guards and may start a new job. */
export function shouldResetConfirmVision(
  previous: ConfirmVisionScope,
  next: ConfirmVisionScope,
): boolean {
  return previous.draftId !== next.draftId || previous.photoFingerprint !== next.photoFingerprint;
}

/** Identity starts after grouping closes even when the same draft and photos remain. */
export function shouldAttemptIdentityStart(input: {
  deferIdentity: boolean;
  hasAccessToken: boolean;
  draftId: string | null;
  photoFingerprint: string | null;
  groupingJustClosed: boolean;
  draftChanged: boolean;
  photosChanged: boolean;
}): boolean {
  if (input.deferIdentity || !input.hasAccessToken || !input.draftId || !input.photoFingerprint) {
    return false;
  }
  return input.draftChanged || input.photosChanged || input.groupingJustClosed;
}
