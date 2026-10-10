import { describe, expect, it } from "vitest";
import {
  addPhotosToDraft,
  createCaptureSession,
  getActiveDraft,
  switchSingleToBulkBind,
} from "../src/capture/captureSession";
import {
  CONFIRM_ADD_PHOTO_LABEL,
  confirmJerseyIndexPlacement,
  confirmPhotoStrip,
} from "../src/capture/confirmPhotoStrip";
import { createScanLineLedger } from "../src/capture/scanLineLedger";

const URIS = Array.from({ length: 12 }, (_, i) => `file:///photos/${i}.jpg`);

describe("confirmPhotoStrip", () => {
  it("renders filled slots only, in role order, then one add tile", () => {
    const strip = confirmPhotoStrip(
      { front: "a", back: undefined, left: "c", right: undefined, other: "e" },
      { analyzing: false, photoCount: 3 },
    );
    expect(strip.roles).toEqual(["front", "left", "other"]);
    expect(strip.showAddTile).toBe(true);
    expect(CONFIRM_ADD_PHOTO_LABEL).toBe("Foto");
  });

  it("has no empty role slots for an empty jersey, only the add tile", () => {
    const strip = confirmPhotoStrip(
      { front: undefined, back: undefined, left: undefined, right: undefined, other: undefined },
      { analyzing: false, photoCount: 0 },
    );
    expect(strip.roles).toEqual([]);
    expect(strip.showAddTile).toBe(true);
  });

  it("hides the add tile at ten photos and says why", () => {
    const strip = confirmPhotoStrip(
      { front: "a", back: "b", left: undefined, right: undefined, other: undefined },
      { analyzing: false, photoCount: 10 },
    );
    expect(strip.showAddTile).toBe(false);
    expect(strip.capHelper).toBe("Du kan højst have 10 fotos på én trøje.");
  });

  it("hides the add tile while grouping is in flight", () => {
    const strip = confirmPhotoStrip(
      { front: "a", back: undefined, left: undefined, right: undefined, other: undefined },
      { analyzing: true, photoCount: 1 },
    );
    expect(strip.showAddTile).toBe(false);
  });
});

describe("confirmJerseyIndexPlacement", () => {
  it("sits in the header with one jersey and in its own row with two or more", () => {
    expect(confirmJerseyIndexPlacement(1)).toBe("header");
    expect(confirmJerseyIndexPlacement(0)).toBe("header");
    expect(confirmJerseyIndexPlacement(2)).toBe("row");
    expect(confirmJerseyIndexPlacement(5)).toBe("row");
  });
});

describe("addPhotosToDraft", () => {
  it("binds picked photos by fill order without flipping a single session to bulk", () => {
    const session = createCaptureSession(URIS.slice(0, 3));
    const next = addPhotosToDraft(session, getActiveDraft(session).id, [URIS[3] as string]);
    expect(next.branch).toBe("single");
    const draft = getActiveDraft(next);
    expect(draft.photos).toHaveLength(4);
    expect(draft.photos.at(-1)?.role).toBe("right");
  });

  it("falls back to Andet once the four universal roles are used", () => {
    const session = createCaptureSession(URIS.slice(0, 3));
    const next = addPhotosToDraft(session, getActiveDraft(session).id, URIS.slice(3, 5));
    expect(getActiveDraft(next).photos.map((p) => p.role)).toEqual([
      "front",
      "back",
      "left",
      "right",
      "other",
    ]);
  });

  it("refuses an eleventh photo and leaves the rest bound", () => {
    let session = switchSingleToBulkBind(createCaptureSession(URIS.slice(0, 3)));
    const id = getActiveDraft(session).id;
    session = addPhotosToDraft(session, id, URIS.slice(3, 12));
    expect(getActiveDraft(session).photos).toHaveLength(10);
  });

  it("ignores photos the session already has", () => {
    const session = createCaptureSession([URIS[0] as string]);
    const next = addPhotosToDraft(session, getActiveDraft(session).id, [URIS[0] as string]);
    expect(getActiveDraft(next).photos).toHaveLength(1);
  });
});

describe("scan line ledger", () => {
  it("runs once per photo on the first identity read", () => {
    const ledger = createScanLineLedger();
    expect(ledger.shouldRun("photo-1", { inFlight: true, reduceMotion: false })).toBe(true);
    expect(ledger.shouldRun("photo-1", { inFlight: true, reduceMotion: false })).toBe(false);
    expect(ledger.shouldRun("photo-2", { inFlight: true, reduceMotion: false })).toBe(true);
  });

  it("does not run on a reopen, when no read is in flight", () => {
    const ledger = createScanLineLedger();
    expect(ledger.shouldRun("photo-1", { inFlight: false, reduceMotion: false })).toBe(false);
  });

  it("never runs with Reduce Motion, and does not burn the photo's turn", () => {
    const ledger = createScanLineLedger();
    expect(ledger.shouldRun("photo-1", { inFlight: true, reduceMotion: true })).toBe(false);
    expect(ledger.hasRun("photo-1")).toBe(false);
  });

  it("ignores a missing photo key", () => {
    const ledger = createScanLineLedger();
    expect(ledger.shouldRun(null, { inFlight: true, reduceMotion: false })).toBe(false);
  });
});
