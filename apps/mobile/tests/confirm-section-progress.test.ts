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
  DATA_REQUIRED_COUNT,
  DETAILS_REQUIRED_COUNT,
  dataRequiredFilledCount,
  dataSectionFacts,
  detailsRequiredFilledCount,
  detailsSectionFacts,
  sectionProgressRatio,
  sectionProgressTone,
} from "../src/capture/confirmSectionProgress";

const URI_FRONT = "file:///photos/front.jpg";
const CLUB_ID = "550e8400-e29b-41d4-a716-446655440000";
const SEASON_ID = "550e8400-e29b-41d4-a716-446655440001";

describe("confirm section progress", () => {
  it("counts Data required steps as club, season, and kit type only", () => {
    const session = createCaptureSession([URI_FRONT]);
    const draftId = getActiveDraft(session).id;
    expect(DATA_REQUIRED_COUNT).toBe(3);
    expect(dataRequiredFilledCount(getActiveDraft(session))).toBe(0);

    let next = setDraftClub(session, draftId, CLUB_ID, "FCK");
    expect(dataRequiredFilledCount(getActiveDraft(next))).toBe(1);

    next = setDraftSeason(next, draftId, SEASON_ID);
    expect(dataRequiredFilledCount(getActiveDraft(next))).toBe(2);

    next = selectDraftKitType(next, draftId, "home");
    expect(dataRequiredFilledCount(getActiveDraft(next))).toBe(3);
  });

  it("counts Detaljer required steps as size and condition", () => {
    const session = createCaptureSession([URI_FRONT]);
    const draftId = getActiveDraft(session).id;
    expect(DETAILS_REQUIRED_COUNT).toBe(2);
    expect(detailsRequiredFilledCount(getActiveDraft(session))).toBe(0);

    let next = selectDraftSize(session, draftId, "m");
    expect(detailsRequiredFilledCount(getActiveDraft(next))).toBe(1);

    next = selectDraftCondition(next, draftId, "used");
    expect(detailsRequiredFilledCount(getActiveDraft(next))).toBe(2);
  });

  it("maps filled/required to a 0–1 donut ratio", () => {
    expect(sectionProgressRatio(0, 3)).toBe(0);
    expect(sectionProgressRatio(1, 2)).toBe(0.5);
    expect(sectionProgressRatio(3, 3)).toBe(1);
  });

  it("tones the donut as empty, partial, then complete — never a fourth state", () => {
    expect(sectionProgressTone(0, 3)).toBe("empty");
    expect(sectionProgressTone(1, 3)).toBe("partial");
    expect(sectionProgressTone(2, 3)).toBe("partial");
    expect(sectionProgressTone(3, 3)).toBe("complete");
  });

  it("lists Data and Detaljer as fact capsules, including empty optional Spiller", () => {
    const session = createCaptureSession([URI_FRONT]);
    const draftId = getActiveDraft(session).id;
    expect(dataSectionFacts(getActiveDraft(session)).map((fact) => fact.value)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(detailsSectionFacts(getActiveDraft(session)).map((fact) => fact.placeholder)).toEqual([
      "Størrelse",
      "Stand",
    ]);

    let next = setDraftClub(session, draftId, CLUB_ID, "FC Barcelona");
    next = setDraftSeason(next, draftId, SEASON_ID, "2023/24");
    next = selectDraftKitType(next, draftId, "home");
    expect(dataSectionFacts(getActiveDraft(next))).toEqual([
      { key: "club", placeholder: "Klub", value: "FC Barcelona" },
      { key: "season", placeholder: "Sæson", value: "2023/24" },
      { key: "type", placeholder: "Type", value: "Hjemme" },
      { key: "player", placeholder: "Spiller", value: null },
    ]);

    next = setDraftPlayer(next, draftId, {
      id: CLUB_ID,
      name: "Lewandowski",
      number: "9",
    });
    expect(dataSectionFacts(getActiveDraft(next))[3]?.value).toBe("Lewandowski");

    next = selectDraftSize(next, draftId, "l");
    next = selectDraftCondition(next, draftId, "used");
    expect(detailsSectionFacts(getActiveDraft(next))).toEqual([
      { key: "size", placeholder: "Størrelse", value: "L" },
      { key: "condition", placeholder: "Stand", value: "Brugt" },
    ]);
  });
});
