import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CAPTURE_CAMERA = join(__dirname, "../src/capture/CaptureCameraSession.tsx");

function readCaptureCamera(): string {
  return readFileSync(CAPTURE_CAMERA, "utf8");
}

describe("repeat camera shoot-first chrome", () => {
  it("has no role overlay Photo slots on the viewfinder", () => {
    const source = readCaptureCamera();

    expect(source).not.toContain("PhotoSlot");
    expect(source).not.toContain("camera-overlay");
    expect(source).not.toContain("activeRole");
  });

  it("shows shutter, n/10 count, filmstrip, gallery escape, and Fortsæt", () => {
    const source = readCaptureCamera();

    expect(source).toContain("MAX_USER_JERSEY_PHOTOS");
    expect(source).toContain("filmstrip");
    expect(source).toContain("Vælg fra galleri");
    expect(source).toContain("Fortsæt");
    expect(source).toContain("onGalleryEscape");
    expect(source).toContain("disabled={photoUris.length === 0}");
  });

  it("disables shutter at ten with the jersey photo cap helper", () => {
    const source = readCaptureCamera();

    expect(source).toContain("JERSEY_PHOTO_CAP_HELPER_DA");
    expect(source).toContain("atPhotoCap");
    expect(source).toContain("capHelper");
  });

  it("does not assign or prompt for roles while shooting", () => {
    const source = readCaptureCamera();

    expect(source).not.toContain("UNIVERSAL_PHOTO_ROLES");
    expect(source).not.toContain("nextEmptyRole");
    expect(source).toContain("onPhotoCaptured?.(shot.uri)");
  });
});
