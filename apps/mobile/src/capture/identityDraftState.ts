import type { VisionJobResponse } from "@kit/api-contract";

/** What Vision left on one jersey that the collector has not settled yet. */
export type IdentityDraftState = {
  /** Low-confidence guess waiting for **Brug forslaget** or **Vælg selv**. */
  suggestion: VisionJobResponse | null;
  /** Vision, not the collector, filled this jersey's facts. */
  applied: boolean;
  catalogMiss: boolean;
  catalogMissHint: string | null;
};

export type IdentityDraftStates = Readonly<Record<string, IdentityDraftState>>;

export const EMPTY_IDENTITY_DRAFT_STATE: IdentityDraftState = {
  suggestion: null,
  applied: false,
  catalogMiss: false,
  catalogMissHint: null,
};

/** The state of one jersey. A jersey Vision has not touched has the empty state. */
export function identityStateFor(
  states: IdentityDraftStates,
  draftId: string | null,
): IdentityDraftState {
  return (draftId !== null ? states[draftId] : undefined) ?? EMPTY_IDENTITY_DRAFT_STATE;
}

/** Changes one jersey's state and leaves every other jersey's untouched. */
export function patchIdentityState(
  states: IdentityDraftStates,
  draftId: string,
  patch: Partial<IdentityDraftState>,
): IdentityDraftStates {
  return { ...states, [draftId]: { ...identityStateFor(states, draftId), ...patch } };
}

/** Forgets one jersey's state, for example when a new read starts for it. */
export function resetIdentityState(
  states: IdentityDraftStates,
  draftId: string,
): IdentityDraftStates {
  if (!(draftId in states)) {
    return states;
  }
  const { [draftId]: _forgotten, ...rest } = states;
  return rest;
}

/** What a finished Vision read leaves on its jersey for the collector to settle. */
export type IdentityLanding = { kind: "suggest"; job: VisionJobResponse } | { kind: "applied" };

/** The patch for the jersey that owns the job, whichever tab is open when it lands. */
export function identityLandingPatch(landing: IdentityLanding): Partial<IdentityDraftState> {
  return landing.kind === "suggest" ? { suggestion: landing.job } : { applied: true };
}

/** The shared fade runs only for the visible jersey; a background landing waits for its tab. */
export function landingFadesIn(draftId: string, activeDraftId: string | null): boolean {
  return draftId === activeDraftId;
}
