import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// vision.ts reaches expo-constants through ./config, which vitest cannot load, so the client is
// read as source, as confirm-vision-cap.test.ts does. The identity log's use of the status is
// tested through runIdentityRead (identity-run-outcome.test.ts).
const visionApi = readFileSync(join(__dirname, "../src/api/vision.ts"), "utf8");

describe("Vision request errors carry the HTTP status", () => {
  it("declares VisionRequestError with the response status", () => {
    expect(visionApi).toContain("export class VisionRequestError extends Error");
    expect(visionApi).toContain("readonly status: number;");
    expect(visionApi).toContain('this.name = "VisionRequestError";');
  });

  it("throws it with the status where a suggest or a job read fails", () => {
    const withStatus = visionApi.match(
      /new VisionRequestError\("Kunne ikke (starte Vision|hente Vision-forslag)", response\.status\)/g,
    );

    // startVisionSuggest, fetchVisionJob and their two unsigned twins.
    expect(withStatus).toHaveLength(4);
    expect(visionApi).not.toMatch(/new Error\("Kunne ikke (starte Vision|hente Vision-forslag)"/);
  });
});
