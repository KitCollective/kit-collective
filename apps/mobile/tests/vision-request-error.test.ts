import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchUnsignedVisionJob,
  fetchVisionJob,
  startUnsignedVisionSuggest,
  startVisionSuggest,
  VisionRequestError,
} from "../src/api/vision";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

const JOB = "550e8400-e29b-41d4-a716-446655440010";
const payload = { draftId: "draft-1", photos: [{ role: "front" as const, contentBase64: "AAAA" }] };

describe("Vision request errors carry the HTTP status", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "nope" }), { status: 500 })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["startVisionSuggest", () => startVisionSuggest("token", payload), "Kunne ikke starte Vision"],
    ["fetchVisionJob", () => fetchVisionJob("token", JOB), "Kunne ikke hente Vision-forslag"],
    [
      "startUnsignedVisionSuggest",
      () => startUnsignedVisionSuggest(payload),
      "Kunne ikke starte Vision",
    ],
    [
      "fetchUnsignedVisionJob",
      () => fetchUnsignedVisionJob(JOB),
      "Kunne ikke hente Vision-forslag",
    ],
  ])("%s rejects with VisionRequestError on a non-ok response", async (_name, call, message) => {
    const error = await call().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(VisionRequestError);
    expect(error).toMatchObject({ name: "VisionRequestError", status: 500, message });
  });

  it("keeps a 402 that is not PREMIUM_REQUIRED a plain request error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ code: "OTHER" }), { status: 402 })),
    );

    await expect(startVisionSuggest("token", payload)).rejects.toMatchObject({
      name: "VisionRequestError",
      status: 402,
    });
  });
});
