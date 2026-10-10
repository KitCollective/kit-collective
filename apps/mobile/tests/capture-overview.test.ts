import { describe, expect, it } from "vitest";
import {
  completeOverviewDraft,
  firstUnsavedDraftId,
  inboxRow,
  nextUnsavedDraftId,
  overviewCaption,
  overviewDock,
  overviewProgress,
  overviewRows,
  overviewTitle,
  parkedRow,
  pendingSkeletonRows,
  shouldOpenBulkOverview,
  visionOnForCapture,
} from "../src/capture/captureOverview";
import {
  appendSavedDraft,
  applyGroupingSuggestion,
  createCaptureSession,
  createMemoryCaptureSessionStore,
  markGroupingSettled,
  markOverviewSession,
  parkSession,
  reloadCaptureSession,
  selectDraftCondition,
  selectDraftKitType,
  selectDraftSize,
  setDraftCatalogSide,
  setDraftSeason,
  unparkSession,
} from "../src/capture/captureSession";
import type { CaptureSessionState } from "../src/capture/captureSessionTypes";

const URIS = Array.from({ length: 12 }, (_, index) => `file:///photos/p-${index}.jpg`);

function ids(state: CaptureSessionState, from: number, to: number): string[] {
  return URIS.slice(from, to).map((uri) => state.photoIdByUri![uri]!);
}

/** Three drafts (90, 60 = Tjek, 88) and a 20 group left without a jersey. */
function groupedSession(): CaptureSessionState {
  const session = createCaptureSession(URIS);
  return applyGroupingSuggestion(
    session,
    {
      groups: [
        { photoIds: ids(session, 0, 3), confidence: 90 },
        { photoIds: ids(session, 3, 5), confidence: 60 },
        { photoIds: ids(session, 5, 8), confidence: 88 },
        { photoIds: ids(session, 8, 10), confidence: 20 },
      ],
    },
    {},
  );
}

function fillIdentity(
  state: CaptureSessionState,
  draftId: string,
  club: string,
): CaptureSessionState {
  let next = setDraftCatalogSide(state, draftId, { id: `${club}-id`, label: club, kind: "club" });
  next = setDraftSeason(next, draftId, `${club}-season`, "2023/24");
  return selectDraftKitType(next, draftId, "home");
}

describe("bulk overview entry", () => {
  it("opens for four or more photos with Vision on, never for three or fewer or Vision off", () => {
    expect(shouldOpenBulkOverview({ branch: "bulk", visionOn: true })).toBe(true);
    expect(shouldOpenBulkOverview({ branch: "single", visionOn: true })).toBe(false);
    expect(shouldOpenBulkOverview({ branch: "bulk", visionOn: false })).toBe(false);
  });

  it("counts Vision as on when signed in with quota left", () => {
    expect(visionOnForCapture({ accessToken: "t", outOfQuota: false })).toBe(true);
    expect(visionOnForCapture({ accessToken: "t", outOfQuota: true })).toBe(false);
    expect(visionOnForCapture({ accessToken: null, outOfQuota: false })).toBe(false);
  });
});

describe("overview rows", () => {
  it("sorts Tjek first, then incomplete, then ready, then saved, and says what each needs", () => {
    let state = groupedSession();
    const [a, b, c] = state.drafts;
    state = fillIdentity(state, a!.id, "FC København");
    state = fillIdentity(state, c!.id, "Brøndby");
    state = selectDraftSize(state, c!.id, "m");
    state = selectDraftCondition(state, c!.id, "used");
    state = appendSavedDraft(state, {
      draftId: "saved-1",
      thumbUri: URIS[11]!,
      clubLabel: "AGF",
      seasonLabel: "2022/23",
      kitType: "away",
    });

    const rows = overviewRows(state);

    expect(rows.map((row) => row.status)).toEqual(["check", "incomplete", "ready", "saved"]);
    expect(rows[0]).toMatchObject({ draftId: b!.id, statusLabel: "Tjek" });
    expect(rows[1]).toMatchObject({
      draftId: a!.id,
      title: "FC København",
      statusLabel: "Str. og stand",
    });
    expect(rows[2]).toMatchObject({ draftId: c!.id, title: "Brøndby", statusLabel: null });
    expect(rows[3]).toMatchObject({ kind: "saved", title: "AGF", statusLabel: "Gemt" });
  });

  it("names the identity as the need while the jersey has no club and season yet", () => {
    const rows = overviewRows(groupedSession());
    const incomplete = rows.filter((row) => row.status === "incomplete");
    expect(incomplete.length).toBeGreaterThan(0);
    expect(incomplete[0]!.statusLabel).toBe("Klub og sæson");
    expect(incomplete[0]!.title).toMatch(/^Trøje \d$/);
  });

  it("keeps session order inside one status and skips drafts with no photos", () => {
    const session = createCaptureSession(URIS);
    const state = applyGroupingSuggestion(
      session,
      {
        groups: [
          { photoIds: ids(session, 0, 2), confidence: 90 },
          { photoIds: ids(session, 2, 4), confidence: 90 },
        ],
      },
      {},
    );
    const rows = overviewRows(state);
    expect(rows.map((row) => row.draftId)).toEqual(state.drafts.map((draft) => draft.id));
    expect(overviewRows(createCaptureSession(URIS.slice(0, 4)))).toEqual([]);
  });

  it("opens the first unsaved draft and advances to the next unsaved one", () => {
    const state = groupedSession();
    const rows = overviewRows(state).filter((row) => row.kind === "draft");
    expect(firstUnsavedDraftId(state)).toBe(rows[0]!.draftId);
    expect(nextUnsavedDraftId(state, rows[0]!.draftId)).toBe(rows[1]!.draftId);
    expect(nextUnsavedDraftId(state, rows.at(-1)!.draftId)).toBe(rows[0]!.draftId);
  });

  it("moves a saved draft to a Gemt row, activates the next unsaved one, and ends with none", () => {
    const grouped = groupedSession();
    const order = overviewRows(grouped).map((row) => row.draftId);
    const state = markOverviewSession(grouped);

    const afterFirst = completeOverviewDraft(state, order[0]!);
    expect(afterFirst.savedDrafts).toHaveLength(1);
    expect(afterFirst.drafts.some((draft) => draft.id === order[0])).toBe(false);
    expect(afterFirst.activeDraftId).toBe(order[1]);
    expect(overviewRows(afterFirst).at(-1)).toMatchObject({ kind: "saved", statusLabel: "Gemt" });

    let rest = afterFirst;
    for (const draftId of order.slice(1)) {
      rest = completeOverviewDraft(rest, draftId);
    }
    expect(firstUnsavedDraftId(rest)).toBeNull();
    expect(rest.savedDrafts).toHaveLength(order.length);
  });
});

describe("overview chrome", () => {
  it("titles the run and the result, with singular and plural", () => {
    expect(overviewTitle({ analyzing: true, totalPhotos: 16, jerseyCount: 0 })).toBe(
      "Sorterer 16 fotos",
    );
    expect(overviewTitle({ analyzing: false, totalPhotos: 16, jerseyCount: 6 })).toBe(
      "6 trøjer fundet",
    );
    expect(overviewTitle({ analyzing: false, totalPhotos: 5, jerseyCount: 1 })).toBe(
      "1 trøje fundet",
    );
  });

  it("captions the title with the photo count and the state", () => {
    expect(overviewCaption({ analyzing: false, totalPhotos: 16 })).toBe("16 fotos · sorteret");
    expect(overviewCaption({ analyzing: true, totalPhotos: 16 })).toBe("Vision læser dine fotos");
  });

  it("reports progress as the share of photos placed, and skeletons only while running", () => {
    expect(overviewProgress({ totalPhotos: 10, unboundCount: 10 })).toBe(0);
    expect(overviewProgress({ totalPhotos: 10, unboundCount: 4 })).toBeCloseTo(0.6);
    expect(overviewProgress({ totalPhotos: 0, unboundCount: 0 })).toBe(0);
    expect(pendingSkeletonRows({ analyzing: true, unboundCount: 12 })).toBeGreaterThan(0);
    expect(pendingSkeletonRows({ analyzing: false, unboundCount: 12 })).toBe(0);
    expect(pendingSkeletonRows({ analyzing: true, unboundCount: 0 })).toBe(0);
  });

  it("shows the inbox row only when photos without a jersey exist", () => {
    const row = inboxRow(groupedSession());
    expect(row).toMatchObject({ count: 4, label: "4 fotos uden trøje", pill: "Sortér" });
    expect(row?.thumbUris.length).toBeLessThanOrEqual(3);

    const session = createCaptureSession(URIS.slice(0, 4));
    const bound = applyGroupingSuggestion(
      session,
      { groups: [{ photoIds: ids(session, 0, 4), confidence: 95 }] },
      {},
    );
    expect(inboxRow(bound)).toBeNull();
  });

  it("labels the dock for running, done, and finished", () => {
    expect(overviewDock({ analyzing: true, unsavedCount: 0, firstTitle: null })).toEqual({
      primary: { label: "Start med første trøje", disabled: true },
      tertiary: "Sortér selv i stedet",
    });
    expect(overviewDock({ analyzing: true, unsavedCount: 1, firstTitle: "FC København" })).toEqual({
      primary: { label: "Start med FC København", disabled: false },
      tertiary: "Sortér selv i stedet",
    });
    expect(overviewDock({ analyzing: false, unsavedCount: 3, firstTitle: "x" })).toEqual({
      primary: { label: "Gennemgå 3 trøjer", disabled: false },
      tertiary: "Gør resten færdig senere",
    });
    expect(overviewDock({ analyzing: false, unsavedCount: 1, firstTitle: "x" }).primary.label).toBe(
      "Gennemgå 1 trøje",
    );
    expect(overviewDock({ analyzing: false, unsavedCount: 0, firstTitle: null })).toEqual({
      primary: { label: "Se samlingen", disabled: false },
      tertiary: null,
    });
  });
});

describe("parked session row", () => {
  const now = new Date(2026, 9, 10, 12, 0, 0).getTime();
  const yesterday = new Date(2026, 9, 9, 22, 0, 0).getTime();

  it("is absent until the session is parked", () => {
    expect(parkedRow(groupedSession(), now)).toBeNull();
  });

  it("shows missing jerseys, age and loose photos, and reopens the session", () => {
    const state = parkSession(groupedSession(), yesterday);
    const row = parkedRow(state, now);

    expect(row).toMatchObject({
      sessionId: state.sessionId,
      title: "3 trøjer mangler",
      caption: "Fra i går · 4 løse fotos",
      pill: "Fortsæt",
    });
    expect(row!.thumbUris.length).toBeLessThanOrEqual(3);
  });

  it("words the age for today and older sessions", () => {
    const state = groupedSession();
    expect(parkedRow(parkSession(state, now), now)!.caption).toMatch(/^Fra i dag/);
    const old = new Date(2026, 9, 6, 9, 0, 0).getTime();
    expect(parkedRow(parkSession(state, old), now)!.caption).toMatch(/^Fra 4 dage siden/);
  });

  it("counts saved jerseys out of what is missing", () => {
    let state = markOverviewSession(groupedSession());
    state = completeOverviewDraft(state, firstUnsavedDraftId(state)!);
    const row = parkedRow(parkSession(state, now), now);
    expect(row!.title).toBe("2 trøjer mangler");
  });

  it("is gone once the collector reopens the overview", () => {
    const parked = parkSession(groupedSession(), yesterday);
    expect(parkedRow(unparkSession(parked), now)).toBeNull();
  });

  it("names the photos when no jersey is missing but photos are still loose", () => {
    const session = createCaptureSession(URIS.slice(0, 5));
    const row = parkedRow(parkSession(session, yesterday), now);
    expect(row).toMatchObject({ title: "5 fotos uden trøje", caption: "Fra i går" });
  });
});

describe("overview session state", () => {
  it("survives a persist and reload: overview, parked, saved rows and the settled run", () => {
    const store = createMemoryCaptureSessionStore();
    const session = createCaptureSession(URIS, { store });
    let state = applyGroupingSuggestion(
      session,
      { groups: [{ photoIds: ids(session, 0, 3), confidence: 90 }] },
      {},
    );
    state = markOverviewSession(state);
    state = markGroupingSettled(state);
    state = appendSavedDraft(state, {
      draftId: "saved-1",
      thumbUri: URIS[0]!,
      clubLabel: "AGF",
      seasonLabel: "2022/23",
      kitType: "away",
    });
    state = parkSession(state, 1_000);

    const reloaded = reloadCaptureSession(store)!;

    expect(reloaded.overview).toBe(true);
    expect(reloaded.parkedAt).toBe(1_000);
    expect(reloaded.groupingSettledKey).toBe(state.groupingSettledKey);
    expect(reloaded.savedDrafts).toHaveLength(1);
  });
});
