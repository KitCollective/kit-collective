import { describe, expect, it } from "vitest";
import {
  createCaptureSession,
  getActiveDraft,
  selectDraftCondition,
  selectDraftKitType,
  selectDraftSize,
  setDraftBadge,
  setDraftClub,
  setDraftNotes,
  setDraftSeason,
} from "../src/capture/captureSession";
import { confirmSaveEnabled } from "../src/capture/confirmIdentityBlock";
import { getSaveBlockMessage } from "../src/capture/saveBlockMessage";

/**
 * The donut section progress (Data 3, Detaljer 2) is gone with the cards (design lock: Confirm
 * and Save, Revision 2026-10-09). What is left is the Save rule itself, which the hub now owns:
 * size and condition sit on the hub, Badge and Noter never gate Gem.
 */

const URI_FRONT = "file:///photos/front.jpg";
const CLUB_ID = "550e8400-e29b-41d4-a716-446655440000";
const SEASON_ID = "550e8400-e29b-41d4-a716-446655440001";

function identityFilled(options?: { defaultSize?: "m" | null }) {
  let session = createCaptureSession([URI_FRONT], options);
  const id = getActiveDraft(session).id;
  session = setDraftClub(session, id, CLUB_ID, "FC Barcelona");
  session = setDraftSeason(session, id, SEASON_ID, "2023/24");
  session = selectDraftKitType(session, id, "home");
  return { session, id };
}

describe("confirm hub Save rule", () => {
  it("needs size and condition on the hub, in addition to club, season and type", () => {
    const { session, id } = identityFilled();
    expect(
      confirmSaveEnabled({ draft: getActiveDraft(session), lowConfidencePending: false }),
    ).toBe(false);
    expect(getSaveBlockMessage(getActiveDraft(session))).toBe("Vælg en størrelse.");

    const sized = selectDraftSize(session, id, "m");
    expect(getSaveBlockMessage(getActiveDraft(sized))).toBe("Vælg stand.");

    const done = selectDraftCondition(sized, id, "used");
    expect(confirmSaveEnabled({ draft: getActiveDraft(done), lowConfidencePending: false })).toBe(
      true,
    );
    expect(getSaveBlockMessage(getActiveDraft(done))).toBeNull();
  });

  it("is one tap from Gem when the last size is pre-selected: only the condition is left", () => {
    const { session, id } = identityFilled({ defaultSize: "m" });
    expect(getActiveDraft(session).sizeSelected).toBe(true);
    expect(getSaveBlockMessage(getActiveDraft(session))).toBe("Vælg stand.");
    const done = selectDraftCondition(session, id, "new");
    expect(confirmSaveEnabled({ draft: getActiveDraft(done), lowConfidencePending: false })).toBe(
      true,
    );
  });

  it("never lets the optional Badge or Noter decide Gem", () => {
    const { session, id } = identityFilled({ defaultSize: "m" });
    const withExtras = setDraftNotes(
      setDraftBadge(session, id, { id: CLUB_ID, label: "Champions League" }),
      id,
      "Lidt slidt ved kraven",
    );
    expect(
      confirmSaveEnabled({ draft: getActiveDraft(withExtras), lowConfidencePending: false }),
    ).toBe(false);
    const done = selectDraftCondition(withExtras, id, "used");
    expect(confirmSaveEnabled({ draft: getActiveDraft(done), lowConfidencePending: false })).toBe(
      true,
    );
  });
});
