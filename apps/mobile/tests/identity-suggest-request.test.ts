import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const identitySuggestRequestPath = join(
  __dirname,
  "../src/capture/identitySuggestRequest.ts",
);
const analysingPath = join(__dirname, "../src/first-session/analysing-screen.tsx");
const confirmVisionPath = join(__dirname, "../src/capture/use-confirm-vision.ts");
const jerseyDetailsPath = join(__dirname, "../src/first-session/jersey-details-screen.tsx");

describe("identitySuggestRequest seam", () => {
  it("builds one VisionSuggestRequest from every bound draft photo", () => {
    const source = readFileSync(identitySuggestRequestPath, "utf8");

    expect(source).toContain("export async function buildIdentitySuggestRequest");
    expect(source).toContain("draft.photos.map");
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
