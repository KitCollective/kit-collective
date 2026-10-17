import type { VisionFieldPreselect, VisionJobResponse } from "@kit/api-contract";
import { applyIdentitySuggestion, suggestedCatalogSideId } from "@/capture/captureSession";
import type { CaptureSessionMutator } from "@/capture/captureSessionTypes";
import { resolveVisionCatalogMissHint } from "@/capture/catalogMissHint";
import {
  buildSuggestOnlyVisionJob,
  type IdentityManualEditMask,
} from "@/capture/identitySuggestOnly";

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

function hasPreselectFields(fieldPreselect: VisionFieldPreselect | undefined): boolean {
  return Boolean(
    fieldPreselect?.club ||
      fieldPreselect?.season ||
      fieldPreselect?.type ||
      fieldPreselect?.player ||
      fieldPreselect?.badge,
  );
}

function hasSuggestFields(job: VisionJobResponse): boolean {
  return Boolean(
    job.suggestions?.clubId ||
      job.suggestions?.seasonId ||
      job.suggestions?.type ||
      job.suggestions?.playerId ||
      job.suggestions?.patchId ||
      job.catalogMiss ||
      job.clubHint ||
      job.nationalTeamHint,
  );
}

export type LandIdentityResultInput = {
  job: VisionJobResponse;
  /** The jersey that owns the job, whichever tab is open when it lands. */
  targetDraftId: string;
  /** Read live: the collector can switch tabs while the landing awaits. */
  activeDraftId: () => string | null;
  accessToken: string | null;
  mutate: CaptureSessionMutator;
  patchIdentity: (draftId: string, patch: Partial<IdentityDraftState>) => void;
  setSelectedSeasonLabel: (label: string | null) => void;
  fetchSeasons: (accessToken: string, sideId: string) => Promise<unknown>;
  /** Read live, before and after the season fetch: the collector can edit mid-landing. */
  manualEdits: () => IdentityManualEditMask;
};

/**
 * Lands a finished Vision read on the jersey that owns it. Every write is keyed by
 * `targetDraftId`; only the shared season label and fade follow the visible jersey.
 */
export async function landIdentityResult({
  job,
  targetDraftId: currentDraftId,
  activeDraftId,
  accessToken,
  mutate,
  patchIdentity,
  setSelectedSeasonLabel,
  fetchSeasons,
  manualEdits,
}: LandIdentityResultInput): Promise<void> {
  patchIdentity(currentDraftId, {
    catalogMiss: job.catalogMiss === true,
    catalogMissHint: job.catalogMiss ? resolveVisionCatalogMissHint(job) : null,
  });

  if (job.catalogMiss && !job.suggestions) {
    return;
  }

  const fieldPreselect = job.fieldPreselect ?? {};
  const suggestions = job.suggestions;
  const shouldPreselect = hasPreselectFields(fieldPreselect);

  if (!shouldPreselect && suggestions) {
    patchIdentity(currentDraftId, identityLandingPatch({ kind: "suggest", job }));
    return;
  }

  if (!shouldPreselect && !hasSuggestFields(job)) {
    return;
  }

  if (suggestions) {
    mutate((current) =>
      applyIdentitySuggestion(current, currentDraftId, suggestions, {
        fieldPreselect,
        manualEdits: manualEdits(),
      }),
    );

    if (
      landingFadesIn(currentDraftId, activeDraftId()) &&
      !manualEdits().season &&
      suggestions.seasonLabel &&
      fieldPreselect.season
    ) {
      setSelectedSeasonLabel(suggestions.seasonLabel);
    }

    const suggestedSideId = suggestedCatalogSideId(suggestions, fieldPreselect);
    if (!manualEdits().season && accessToken && suggestedSideId) {
      try {
        await fetchSeasons(accessToken, suggestedSideId);
      } catch {
        // Season list is a Data drill convenience — a miss must not unwind applied fields.
      }
    }

    const suggestOnlyJob = buildSuggestOnlyVisionJob(job, manualEdits());
    if (suggestOnlyJob) {
      patchIdentity(currentDraftId, identityLandingPatch({ kind: "suggest", job: suggestOnlyJob }));
      return;
    }

    patchIdentity(currentDraftId, identityLandingPatch({ kind: "applied" }));
  }
}
