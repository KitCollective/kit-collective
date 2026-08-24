export type ConfirmVisionScope = {
  draftId: string | null;
  firstPhotoUri: string | null;
};

export function confirmVisionScopeFromDraft(
  draft: { id: string; photos: ReadonlyArray<{ uri: string }> } | null | undefined,
): ConfirmVisionScope {
  return {
    draftId: draft?.id ?? null,
    firstPhotoUri: draft?.photos[0]?.uri ?? null,
  };
}

/** True when the Confirm screen should reset Vision guards and may start a new job. */
export function shouldResetConfirmVision(
  previous: ConfirmVisionScope,
  next: ConfirmVisionScope,
): boolean {
  return previous.draftId !== next.draftId || previous.firstPhotoUri !== next.firstPhotoUri;
}
