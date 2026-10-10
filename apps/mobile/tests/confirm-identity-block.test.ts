import { describe, expect, it } from "vitest";
import {
  createCaptureSession,
  getActiveDraft,
  selectDraftCondition,
  selectDraftKitType,
  selectDraftSize,
  setDraftClub,
  setDraftPlayer,
  setDraftSeason,
} from "../src/capture/captureSession";
import {
  CONFIRM_IDENTITY_COPY,
  confirmSaveEnabled,
  hasPendingLowConfidence,
  type IdentityBlockInput,
  resolveIdentityBlock,
} from "../src/capture/confirmIdentityBlock";

const URI_FRONT = "file:///photos/front.jpg";
const CLUB_ID = "550e8400-e29b-41d4-a716-446655440000";
const SEASON_ID = "550e8400-e29b-41d4-a716-446655440001";

function freshDraft() {
  return getActiveDraft(createCaptureSession([URI_FRONT]));
}

function filledSession() {
  let session = createCaptureSession([URI_FRONT]);
  const id = getActiveDraft(session).id;
  session = setDraftClub(session, id, CLUB_ID, "FC Barcelona");
  session = setDraftSeason(session, id, SEASON_ID, "2023/24");
  session = selectDraftKitType(session, id, "home");
  return { session, id };
}

const baseInput = (overrides: Partial<IdentityBlockInput> = {}): IdentityBlockInput => ({
  draft: freshDraft(),
  visionOn: true,
  inFlight: false,
  filledByVision: false,
  suggestion: null,
  ...overrides,
});

describe("resolveIdentityBlock: resolved", () => {
  it("shows the club in display and season, type and player in mono, with Ret", () => {
    const { session, id } = filledSession();
    const withPlayer = setDraftPlayer(session, id, {
      id: CLUB_ID,
      name: "Lewandowski",
      number: "9",
    });
    const block = resolveIdentityBlock(
      baseInput({ draft: getActiveDraft(withPlayer), filledByVision: true }),
    );
    expect(block.kind).toBe("resolved");
    expect(block.label).toBe("Fundet af Vision");
    expect(block.headline).toBe("FC Barcelona");
    expect(block.monoLine).toBe("2023/24 · Hjemme · Lewandowski");
    expect(block.pill).toEqual({ label: "Ret", tone: "secondary", action: "open-data" });
    expect(block.actions).toEqual([]);
  });

  it("does not claim Vision found a jersey the collector filled in by hand", () => {
    const { session } = filledSession();
    const block = resolveIdentityBlock(
      baseInput({ draft: getActiveDraft(session), filledByVision: false }),
    );
    expect(block.kind).toBe("resolved");
    expect(block.label).toBeNull();
  });

  it("falls back to the national team label", () => {
    let session = createCaptureSession([URI_FRONT]);
    const draft = getActiveDraft(session);
    session = {
      ...session,
      drafts: [{ ...draft, nationalTeamId: CLUB_ID, nationalTeamLabel: "Danmark" }],
    };
    const block = resolveIdentityBlock(baseInput({ draft: getActiveDraft(session) }));
    expect(block.headline).toBe("Danmark");
  });
});

describe("resolveIdentityBlock: in flight", () => {
  it("labels the block and leaves every unlanded fact as a placeholder bar", () => {
    const block = resolveIdentityBlock(baseInput({ inFlight: true }));
    expect(block.kind).toBe("in-flight");
    expect(block.label).toBe("Vision læser trøjen");
    expect(block.facts.map((fact) => [fact.key, fact.value])).toEqual([
      ["club", null],
      ["season", null],
      ["type", null],
    ]);
    expect(block.pill).toBeNull();
  });

  it("lets facts appear as they land", () => {
    let session = createCaptureSession([URI_FRONT]);
    const id = getActiveDraft(session).id;
    session = setDraftClub(session, id, CLUB_ID, "FC Barcelona");
    const block = resolveIdentityBlock(
      baseInput({ draft: getActiveDraft(session), inFlight: true }),
    );
    expect(block.facts.map((fact) => fact.value)).toEqual(["FC Barcelona", null, null]);
  });

  it("keeps size and condition usable, so Gem still follows the Save rule", () => {
    expect(confirmSaveEnabled({ draft: freshDraft(), lowConfidencePending: false })).toBe(false);
  });
});

describe("resolveIdentityBlock: low confidence", () => {
  const suggestion = {
    clubId: CLUB_ID,
    clubLabel: "FC Barcelona",
    seasonId: SEASON_ID,
    seasonLabel: "2011/12",
    type: "home" as const,
  };

  it("shows the guess muted with a question mark and two pills, nothing pre-selected", () => {
    const block = resolveIdentityBlock(baseInput({ suggestion }));
    expect(block.kind).toBe("low-confidence");
    expect(block.label).toBe("Vision er ikke sikker");
    expect(block.headline).toBe("FC Barcelona?");
    expect(block.headlineTone).toBe("muted");
    expect(block.monoLine).toBe("2011/12 · Hjemme");
    expect(block.actions).toEqual([
      { label: "Brug forslaget", tone: "primary", action: "apply-suggestion" },
      { label: "Vælg selv", tone: "secondary", action: "choose-myself" },
    ]);
    expect(block.pill).toBeNull();
  });

  it("shows the season alternative only when the result carries one", () => {
    const without = resolveIdentityBlock(baseInput({ suggestion }));
    expect(without.monoLine).not.toContain("eller");
    const withAlt = resolveIdentityBlock(baseInput({ suggestion, seasonAlternative: "2012/13" }));
    expect(withAlt.monoLine).toBe("2011/12 eller 2012/13 · Hjemme");
  });

  it("keeps Gem disabled until Brug forslaget or Vælg selv, even when the draft is complete", () => {
    const { session } = filledSession();
    const id = getActiveDraft(session).id;
    let next = selectDraftSize(session, id, "m");
    next = selectDraftCondition(next, id, "used");
    const draft = getActiveDraft(next);
    expect(confirmSaveEnabled({ draft, lowConfidencePending: false })).toBe(true);
    expect(confirmSaveEnabled({ draft, lowConfidencePending: true })).toBe(false);
  });

  it("is pending only for identity facts, not for a lone player or badge suggestion", () => {
    expect(hasPendingLowConfidence(null)).toBe(false);
    expect(hasPendingLowConfidence({ playerId: CLUB_ID, playerLabel: "X" })).toBe(false);
    expect(hasPendingLowConfidence({ clubId: CLUB_ID, clubLabel: "FCB" })).toBe(true);
    expect(hasPendingLowConfidence({ seasonId: SEASON_ID })).toBe(true);
    expect(hasPendingLowConfidence({ type: "away" })).toBe(true);
  });

  it("wins over resolved but not over in flight", () => {
    const { session } = filledSession();
    const draft = getActiveDraft(session);
    expect(resolveIdentityBlock(baseInput({ draft, suggestion })).kind).toBe("low-confidence");
    expect(resolveIdentityBlock(baseInput({ draft, suggestion, inFlight: true })).kind).toBe(
      "in-flight",
    );
  });
});

describe("resolveIdentityBlock: empty", () => {
  it("says Vision is off and offers Vælg in fill.primary", () => {
    const block = resolveIdentityBlock(baseInput({ visionOn: false }));
    expect(block.kind).toBe("empty");
    expect(block.label).toBe("Vision er slået fra");
    expect(block.labelTone).toBe("secondary");
    expect(block.headline).toBe("Vælg klub og sæson");
    expect(block.headlineTone).toBe("muted");
    expect(block.monoLine).toBe("Klub · sæson · type");
    expect(block.pill).toEqual({ label: "Vælg", tone: "primary", action: "open-data" });
  });

  it("shows the in-flight block, not 'not found', while the first read has not landed", () => {
    const block = resolveIdentityBlock(baseInput({ inFlight: true }));
    expect(block.kind).toBe("in-flight");
  });

  it("says Vision did not find the jersey when Vision is on, no read is running and nothing was found", () => {
    const block = resolveIdentityBlock(baseInput());
    expect(block.kind).toBe("empty");
    expect(block.label).toBe("Vision fandt ikke trøjen");
  });

  it("keeps the Danish copy in one place", () => {
    expect(CONFIRM_IDENTITY_COPY.visionOff).toBe("Vision er slået fra");
    expect(CONFIRM_IDENTITY_COPY.notFound).toBe("Vision fandt ikke trøjen");
  });
});

describe("confirmSaveEnabled", () => {
  it("is on exactly when photo, club or national team, season, type, size and condition are set", () => {
    const base = createCaptureSession([URI_FRONT]);
    const id = getActiveDraft(base).id;
    const steps: Array<(s: typeof base) => typeof base> = [
      (s) => setDraftClub(s, id, CLUB_ID, "FC Barcelona"),
      (s) => setDraftSeason(s, id, SEASON_ID, "2023/24"),
      (s) => selectDraftKitType(s, id, "home"),
      (s) => selectDraftSize(s, id, "m"),
      (s) => selectDraftCondition(s, id, "used"),
    ];
    let session = base;
    for (const [index, step] of steps.entries()) {
      const before = getActiveDraft(session);
      expect(confirmSaveEnabled({ draft: before, lowConfidencePending: false })).toBe(false);
      session = step(session);
      const isLast = index === steps.length - 1;
      const after = getActiveDraft(session);
      expect(confirmSaveEnabled({ draft: after, lowConfidencePending: false })).toBe(isLast);
    }
  });

  it("needs a photo", () => {
    const { session } = filledSession();
    const id = getActiveDraft(session).id;
    let next = selectDraftSize(session, id, "m");
    next = selectDraftCondition(next, id, "used");
    const draft = { ...getActiveDraft(next), photos: [] };
    expect(confirmSaveEnabled({ draft, lowConfidencePending: false })).toBe(false);
  });

  it("accepts a national team in place of a club", () => {
    const { session } = filledSession();
    const id = getActiveDraft(session).id;
    let next = selectDraftSize(session, id, "m");
    next = selectDraftCondition(next, id, "used");
    const draft = {
      ...getActiveDraft(next),
      clubId: null,
      clubLabel: null,
      nationalTeamId: CLUB_ID,
      nationalTeamLabel: "Danmark",
    };
    expect(confirmSaveEnabled({ draft, lowConfidencePending: false })).toBe(true);
  });
});
