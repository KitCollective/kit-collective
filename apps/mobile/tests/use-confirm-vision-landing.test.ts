import type { VisionJobResponse } from "@kit/api-contract";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addJerseyDraft,
  type CaptureJerseyDraft,
  type CaptureSessionState,
  createCaptureSession,
  getActiveDraft,
  getDraft,
  selectDraftCondition,
  selectDraftKitType,
  selectDraftSize,
  setActiveDraft,
  setDraftCatalogSide,
  setDraftClub,
  setDraftSeason,
} from "../src/capture/captureSession";
import { confirmSaveEnabled, hasPendingLowConfidence } from "../src/capture/confirmIdentityBlock";
import {
  clearConfirmSeasonEdited,
  confirmManualEditMask,
  markConfirmClubEdited,
  markConfirmSeasonEdited,
  resetConfirmManualEdits,
  setConfirmManualEditsDraft,
} from "../src/capture/confirmManualEdits";
import {
  type IdentityDraftState,
  type IdentityDraftStates,
  identityStateFor,
  landIdentityResult,
  patchIdentityState,
} from "../src/capture/identityDraftState";
import {
  buildSuggestOnlyVisionJob,
  type IdentityManualEditMask,
} from "../src/capture/identitySuggestOnly";

const TOKEN = "token";
const URI_A = "file:///photos/a-front.jpg";
const CLUB_A = "550e8400-e29b-41d4-a716-446655440000";
const SEASON_A = "550e8400-e29b-41d4-a716-446655440001";
const CLUB_B = "550e8400-e29b-41d4-a716-446655440002";
const SEASON_B = "550e8400-e29b-41d4-a716-446655440003";
const JOB_A = "550e8400-e29b-41d4-a716-446655440010";
const JOB_B = "550e8400-e29b-41d4-a716-446655440011";

const SUGGESTIONS = {
  clubId: CLUB_A,
  clubLabel: "FC Barcelona",
  seasonId: SEASON_A,
  seasonLabel: "2023/24",
  type: "home",
} as const;

const lowConfidenceJob: VisionJobResponse = {
  jobId: JOB_A,
  status: "ready",
  suggestions: SUGGESTIONS,
};

const partialPreselectJob: VisionJobResponse = {
  jobId: JOB_A,
  status: "ready",
  fieldPreselect: { club: true },
  suggestions: SUGGESTIONS,
};

const fullPreselectJob: VisionJobResponse = {
  jobId: JOB_A,
  status: "ready",
  preselect: true,
  fieldPreselect: { club: true, season: true, type: true },
  suggestions: SUGGESTIONS,
};

const PLAYER_A = "550e8400-e29b-41d4-a716-446655440020";
const PATCH_A = "550e8400-e29b-41d4-a716-446655440030";
const CLUB_HAND = "550e8400-e29b-41d4-a716-446655440040";

const everyFieldPreselectJob: VisionJobResponse = {
  jobId: JOB_A,
  status: "ready",
  preselect: true,
  fieldPreselect: { club: true, season: true, type: true, player: true, badge: true },
  suggestions: {
    ...SUGGESTIONS,
    playerId: PLAYER_A,
    playerLabel: "Lamine Yamal",
    playerNumber: "19",
    patchId: PATCH_A,
    patchLabel: "Champions League",
  },
};

const bState: IdentityDraftState = {
  suggestion: { jobId: JOB_B, status: "ready", suggestions: { clubId: CLUB_B } },
  applied: false,
  catalogMiss: true,
  catalogMissHint: "hint-b",
};

/** Two jerseys in one session, B open, B already carrying its own facts and identity state. */
function openTwoJerseys() {
  let session: CaptureSessionState = createCaptureSession([URI_A]);
  const draftA = getActiveDraft(session).id;
  session = addJerseyDraft(session);
  const draftB = getActiveDraft(session).id;
  session = setDraftClub(session, draftB, CLUB_B, "Real Madrid");
  session = setDraftSeason(session, draftB, SEASON_B, "2022/23");
  let states: IdentityDraftStates = patchIdentityState({}, draftB, bState);
  setConfirmManualEditsDraft(draftB);

  const setSelectedSeasonLabel = vi.fn();
  const fetchSeasons = vi.fn().mockResolvedValue(undefined);
  const world = {
    draftA,
    draftB,
    setSelectedSeasonLabel,
    fetchSeasons,
    get session() {
      return session;
    },
    get states() {
      return states;
    },
    open(draftId: string) {
      session = setActiveDraft(session, draftId);
      // useConfirmVision does this on every render: marks follow the visible jersey.
      setConfirmManualEditsDraft(draftId);
    },
    edit(change: (current: CaptureSessionState) => CaptureSessionState) {
      session = change(session);
    },
    land(job: VisionJobResponse, manualEdits: () => IdentityManualEditMask = () => ({})) {
      return landIdentityResult({
        job,
        targetDraftId: draftA,
        activeDraftId: () => session.activeDraftId,
        accessToken: TOKEN,
        mutate: (updater) => {
          session = updater(session);
          return session;
        },
        patchIdentity: (draftId, patch) => {
          states = patchIdentityState(states, draftId, patch);
        },
        setSelectedSeasonLabel,
        fetchSeasons,
        manualEdits,
      });
    },
  };
  return world;
}

describe("a Vision result that lands while another jersey is open", () => {
  beforeEach(() => {
    resetConfirmManualEdits();
  });

  it("stores a low-confidence guess under the jersey that owns the job, not the open one", async () => {
    const world = openTwoJerseys();
    const draftBBefore = getDraft(world.session, world.draftB);
    const stateBBefore = identityStateFor(world.states, world.draftB);

    await world.land(lowConfidenceJob);

    expect(world.session.activeDraftId).toBe(world.draftB);
    expect(identityStateFor(world.states, world.draftA).suggestion).toBe(lowConfidenceJob);
    expect(identityStateFor(world.states, world.draftB)).toEqual(stateBBefore);
    expect(getDraft(world.session, world.draftB)).toEqual(draftBBefore);
    expect(world.setSelectedSeasonLabel).not.toHaveBeenCalled();
    expect(world.fetchSeasons).not.toHaveBeenCalled();
  });

  it("keeps A's suggest-only guess and writes only the preselected club onto A", async () => {
    const world = openTwoJerseys();
    const draftBBefore = getDraft(world.session, world.draftB);
    const stateBBefore = identityStateFor(world.states, world.draftB);

    await world.land(partialPreselectJob);

    const draftA = getDraft(world.session, world.draftA);
    expect(draftA.clubId).toBe(CLUB_A);
    expect(draftA.seasonId).toBeNull();
    expect(draftA.kitType).toBeNull();
    expect(identityStateFor(world.states, world.draftA).suggestion).toEqual(
      buildSuggestOnlyVisionJob(partialPreselectJob),
    );
    expect(identityStateFor(world.states, world.draftA).suggestion?.suggestions).toEqual({
      seasonId: SEASON_A,
      seasonLabel: "2023/24",
      type: "home",
    });
    expect(getDraft(world.session, world.draftB)).toEqual(draftBBefore);
    expect(identityStateFor(world.states, world.draftB)).toEqual(stateBBefore);
    expect(world.setSelectedSeasonLabel).not.toHaveBeenCalled();
    expect(world.fetchSeasons).toHaveBeenCalledWith(TOKEN, CLUB_A);
  });

  // AC2 reads as guess + suggest-only job + "filled by Vision" together. The partial path
  // patches { suggestion } and returns before the applied patch, so A is not flagged as filled
  // by Vision although the club was written. Pinned as a known gap, not fixed here.
  it.fails("also flags A as filled by Vision when part of it was preselected", async () => {
    const world = openTwoJerseys();

    await world.land(partialPreselectJob);

    const a = identityStateFor(world.states, world.draftA);
    expect(a.suggestion).not.toBeNull();
    expect(a.applied).toBe(true);
  });

  it("fills A completely and flags it filled by Vision, leaving B and the season label alone", async () => {
    const world = openTwoJerseys();
    const draftBBefore = getDraft(world.session, world.draftB);
    const stateBBefore = identityStateFor(world.states, world.draftB);

    await world.land(fullPreselectJob);

    const draftA = getDraft(world.session, world.draftA);
    expect(draftA.clubId).toBe(CLUB_A);
    expect(draftA.seasonId).toBe(SEASON_A);
    expect(draftA.kitType).toBe("home");
    expect(identityStateFor(world.states, world.draftA).applied).toBe(true);
    expect(identityStateFor(world.states, world.draftA).suggestion).toBeNull();
    expect(identityStateFor(world.states, world.draftB).applied).toBe(false);
    expect(identityStateFor(world.states, world.draftB)).toEqual(stateBBefore);
    expect(getDraft(world.session, world.draftB)).toEqual(draftBBefore);
    // seasonLabel and fieldPreselect.season are both set, yet the shared label is B's to keep.
    expect(fullPreselectJob.suggestions?.seasonLabel).toBe("2023/24");
    expect(world.setSelectedSeasonLabel).not.toHaveBeenCalled();
  });

  it("sets the shared season label when the owning jersey is the visible one", async () => {
    const world = openTwoJerseys();
    world.open(world.draftA);

    await world.land(fullPreselectJob);

    expect(world.setSelectedSeasonLabel).toHaveBeenCalledTimes(1);
    expect(world.setSelectedSeasonLabel).toHaveBeenCalledWith("2023/24");
    expect(identityStateFor(world.states, world.draftA).applied).toBe(true);
  });

  it("does not set the shared season label when the collector already edited the season", async () => {
    const world = openTwoJerseys();
    world.open(world.draftA);

    await world.land(fullPreselectJob, () => ({ season: true }));

    expect(world.setSelectedSeasonLabel).not.toHaveBeenCalled();
    expect(world.fetchSeasons).not.toHaveBeenCalled();
  });

  it("only records the miss on the owning jersey when the catalog has no match", async () => {
    const world = openTwoJerseys();
    const stateBBefore = identityStateFor(world.states, world.draftB);

    await world.land({ jobId: JOB_A, status: "ready", catalogMiss: true, clubHint: "Nowhere FC" });

    expect(identityStateFor(world.states, world.draftA)).toMatchObject({
      catalogMiss: true,
      catalogMissHint: "Nowhere FC",
    });
    expect(identityStateFor(world.states, world.draftB)).toEqual(stateBBefore);
  });
});

describe("A's save while its low-confidence guess is pending", () => {
  beforeEach(() => {
    resetConfirmManualEdits();
  });

  /** A has every Save-rule fact (photo, side, season, type, size, condition) except the answer. */
  async function landOnCompleteA() {
    const world = openTwoJerseys();
    await world.land(lowConfidenceJob);
    let session = setDraftClub(world.session, world.draftA, CLUB_A, "FC Barcelona");
    session = setDraftSeason(session, world.draftA, SEASON_A, "2023/24");
    session = selectDraftKitType(session, world.draftA, "home");
    session = selectDraftSize(session, world.draftA, "m");
    session = selectDraftCondition(session, world.draftA, "used");
    return { draftA: getDraft(session, world.draftA), states: world.states };
  }

  const saveEnabled = (states: IdentityDraftStates, draft: CaptureJerseyDraft) =>
    confirmSaveEnabled({
      draft,
      lowConfidencePending: hasPendingLowConfidence(
        identityStateFor(states, draft.id).suggestion?.suggestions,
      ),
    });

  it("stays blocked until Brug forslaget, then opens", async () => {
    const { draftA, states } = await landOnCompleteA();
    expect(saveEnabled(states, draftA)).toBe(false);

    // Brug forslaget: applySuggestion patches the owner with suggestion null and applied true.
    const accepted = patchIdentityState(states, draftA.id, { suggestion: null, applied: true });
    expect(saveEnabled(accepted, draftA)).toBe(true);
  });

  it("stays blocked until Vælg selv, then opens", async () => {
    const { draftA, states } = await landOnCompleteA();
    expect(saveEnabled(states, draftA)).toBe(false);

    // Vælg selv: dismissSuggestion patches the owner with suggestion null.
    const dismissed = patchIdentityState(states, draftA.id, { suggestion: null });
    expect(saveEnabled(dismissed, draftA)).toBe(true);
  });
});

describe("manual edits when two jerseys are in the session", () => {
  beforeEach(() => {
    resetConfirmManualEdits();
  });

  it("fills every one of A's fields while B carries a hand-edited club", async () => {
    const world = openTwoJerseys();
    // The collector hand-picks B's club with B open: the screen sets it, then marks it.
    world.open(world.draftB);
    world.edit((session) =>
      setDraftCatalogSide(session, world.draftB, {
        id: CLUB_HAND,
        label: "Hand FC",
        kind: "club",
      }),
    );
    markConfirmClubEdited();
    const draftBBefore = getDraft(world.session, world.draftB);

    await world.land(everyFieldPreselectJob, () => confirmManualEditMask(world.draftA));

    const draftA = getDraft(world.session, world.draftA);
    expect(draftA.clubId).toBe(CLUB_A);
    expect(draftA.seasonId).toBe(SEASON_A);
    expect(draftA.kitType).toBe("home");
    expect(draftA.playerId).toBe(PLAYER_A);
    expect(draftA.badgeId).toBe(PATCH_A);
    expect(identityStateFor(world.states, world.draftA).applied).toBe(true);
    expect(getDraft(world.session, world.draftB)).toEqual(draftBBefore);
  });

  it("still blocks Vision's club on A when A's club was hand-edited and B is open", async () => {
    const world = openTwoJerseys();
    world.open(world.draftA);
    world.edit((session) =>
      setDraftCatalogSide(session, world.draftA, {
        id: CLUB_HAND,
        label: "Hand FC",
        kind: "club",
      }),
    );
    markConfirmClubEdited();
    world.open(world.draftB);

    await world.land(everyFieldPreselectJob, () => confirmManualEditMask(world.draftA));

    const draftA = getDraft(world.session, world.draftA);
    expect(draftA.clubId).toBe(CLUB_HAND);
    expect(draftA.seasonId).toBe(SEASON_A);
    expect(draftA.kitType).toBe("home");
    expect(draftA.playerId).toBe(PLAYER_A);
    expect(draftA.badgeId).toBe(PATCH_A);
  });
});

describe("the manual-edit store", () => {
  beforeEach(() => {
    resetConfirmManualEdits();
  });

  it("files a mark under the visible jersey and clears one jersey's edits on its own", () => {
    setConfirmManualEditsDraft("a");
    markConfirmClubEdited();
    markConfirmSeasonEdited();
    setConfirmManualEditsDraft("b");
    markConfirmSeasonEdited();
    clearConfirmSeasonEdited();

    expect(confirmManualEditMask("a")).toEqual({ club: true, season: true });
    expect(confirmManualEditMask("b")).toEqual({ season: false });

    resetConfirmManualEdits("a");
    expect(confirmManualEditMask("a")).toEqual({});
    expect(confirmManualEditMask("b")).toEqual({ season: false });
  });
});
