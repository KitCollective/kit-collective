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
