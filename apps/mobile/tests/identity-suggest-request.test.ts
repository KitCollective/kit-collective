import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createCaptureSession,
  createCaptureSessionFromPhotos,
} from "../src/capture/captureSession";
import {
  buildIdentitySuggestRequest,
  IDENTITY_PHOTOS_EMPTY,
} from "../src/capture/identitySuggestRequest";

const identitySuggestRequestPath = join(__dirname, "../src/capture/identitySuggestRequest.ts");
const analysingPath = join(__dirname, "../src/first-session/analysing-screen.tsx");
const confirmVisionPath = join(__dirname, "../src/capture/use-confirm-vision.ts");
const jerseyDetailsPath = join(__dirname, "../src/first-session/jersey-details-screen.tsx");

const FRONT_URI = "file:///photos/toulouse-front.jpg";
const BACK_URI = "file:///photos/toulouse-back.jpg";
const FRONT_BYTES = "toulouse-24-25-home-front-crest-bytes";
const BACK_BYTES = "toulouse-24-25-home-back-player-bytes";

async function readStubPhotoBase64(uri: string): Promise<string> {
  if (uri === FRONT_URI) {
    return FRONT_BYTES;
  }
  if (uri === BACK_URI) {
    return BACK_BYTES;
  }
  throw new Error(`unexpected uri ${uri}`);
}

describe("identitySuggestRequest seam", () => {
  it("builds one VisionSuggestRequest from every bound draft photo", () => {
    const source = readFileSync(identitySuggestRequestPath, "utf8");

    expect(source).toContain("export async function buildIdentitySuggestRequest");
    expect(source).toContain("for (const photo of draft.photos)");
    expect(source).not.toContain("Promise.all");
    expect(source).toContain("IDENTITY_PHOTOS_EMPTY");
    expect(source).toContain('"visionIdentity"');
    expect(source).toContain("draftId: draft.id");
    expect(source).toContain('role ?? "front"');
  });

  it("first-session analysing uses the shared builder and unsigned job routes", () => {
    const analysing = readFileSync(analysingPath, "utf8");

    expect(analysing).toContain("buildIdentitySuggestRequest");
    expect(analysing).toContain("startUnsignedVisionSuggest");
    expect(analysing).toContain("fetchUnsignedVisionJob");
    expect(analysing).toContain("VisionJobResponse");
    expect(analysing).not.toContain("firstVisionPhoto");
    expect(analysing).not.toContain("grouping");
  });

  it("signed Confirm and jersey-details reuse the same identity suggest builder", () => {
    const confirmVision = readFileSync(confirmVisionPath, "utf8");
    const jerseyDetails = readFileSync(jerseyDetailsPath, "utf8");

    expect(confirmVision).toContain("buildIdentitySuggestRequest");
    expect(jerseyDetails).toContain("buildIdentitySuggestRequest");
    expect(confirmVision).not.toContain("draft.photos.map(async (photo)");
    expect(jerseyDetails).not.toContain("draft.photos.map(async (photo)");
  });
});

describe("buildIdentitySuggestRequest", () => {
  it("sends front and back photos in one VisionSuggestRequest for a bound draft", async () => {
    const session = createCaptureSessionFromPhotos([
      { uri: BACK_URI, role: "back", source: "gallery" },
      { uri: FRONT_URI, role: "front", source: "gallery" },
    ]);
    const draft = session.drafts[0];
    if (!draft) {
      throw new Error("expected bound draft");
    }

    const request = await buildIdentitySuggestRequest(draft, readStubPhotoBase64);

    expect(request.draftId).toBe(draft.id);
    expect(request.photos).toEqual([
      { role: "front", contentBase64: FRONT_BYTES },
      { role: "back", contentBase64: BACK_BYTES },
    ]);
  });

  it("throws IDENTITY_PHOTOS_EMPTY when the draft has no readable photos", async () => {
    const session = createCaptureSession([]);
    const draft = session.drafts[0];
    if (!draft) {
      throw new Error("expected empty draft");
    }

    await expect(buildIdentitySuggestRequest(draft, readStubPhotoBase64)).rejects.toThrow(
      IDENTITY_PHOTOS_EMPTY,
    );
  });
});
