import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CaptureJerseyDraft } from "../src/capture/captureSessionTypes";
import { buildIdentitySuggestRequest } from "../src/capture/identitySuggestRequest";

vi.mock("../src/capture/photoBytes", () => ({
  readPreparedPhotoBase64: vi.fn(async (uri: string) => `base64:${uri}`),
}));

function draftWithPhotos(
  photos: Array<{ uri: string; role: "front" | "back" | "other" | null }>,
): CaptureJerseyDraft {
  return {
    id: "draft-11111111-1111-4111-8111-111111111111",
    clubId: null,
    clubLabel: null,
    seasonId: null,
    seasonLabel: null,
    kitType: null,
    size: null,
    condition: null,
    kitTypeSelected: false,
    sizeSelected: false,
    conditionSelected: false,
    notes: "",
    playerName: "",
    playerId: null,
    playerNumber: "",
    badgeEnabled: false,
    badgeId: null,
    badgeLabel: null,
    photos: photos.map((photo) => ({
      uri: photo.uri,
      role: photo.role,
      source: "gallery",
    })),
  };
}

describe("buildIdentitySuggestRequest", () => {
  it("includes every bound draft photo with visionIdentity prepare purpose", async () => {
    const draft = draftWithPhotos([
      { uri: "file:///front.jpg", role: "front" },
      { uri: "file:///back.jpg", role: "back" },
      { uri: "file:///tag.jpg", role: "other" },
    ]);

    const request = await buildIdentitySuggestRequest(draft);

    expect(request.draftId).toBe(draft.id);
    expect(request.photos).toEqual([
      { role: "front", contentBase64: "base64:file:///front.jpg" },
      { role: "back", contentBase64: "base64:file:///back.jpg" },
      { role: "other", contentBase64: "base64:file:///tag.jpg" },
    ]);
  });

  it("defaults missing photo role to front", async () => {
    const draft = draftWithPhotos([{ uri: "file:///unassigned.jpg", role: null }]);
    const request = await buildIdentitySuggestRequest(draft);

    expect(request.photos).toEqual([
      { role: "front", contentBase64: "base64:file:///unassigned.jpg" },
    ]);
  });
});

describe("first-session identity seam", () => {
  it("analysing uses the shared identity suggest builder and unsigned job routes", () => {
    const analysing = readFileSync(
      join(__dirname, "../src/first-session/analysing-screen.tsx"),
      "utf8",
    );
    const confirmVision = readFileSync(
      join(__dirname, "../src/capture/use-confirm-vision.ts"),
      "utf8",
    );

    expect(analysing).toContain("buildIdentitySuggestRequest");
    expect(analysing).toContain("startUnsignedVisionSuggest");
    expect(analysing).toContain("fetchUnsignedVisionJob");
    expect(analysing).not.toContain("firstVisionPhoto");
    expect(confirmVision).toContain("buildIdentitySuggestRequest");
    expect(analysing).toContain("VisionJobResponse");
    expect(analysing).not.toContain("grouping");
  });
});
