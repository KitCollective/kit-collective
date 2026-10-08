import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const savePath = join(__dirname, "../src/capture/saveConfirmJersey.ts");
const collectionDetailPath = join(__dirname, "../app/(tabs)/collection/[jerseyId].tsx");

describe("photo variant client wiring", () => {
  it("schedules original upload separately from Save JSON", () => {
    const source = readFileSync(savePath, "utf8");
    expect(source).toContain("scheduleOriginalPhotoUploads");
    expect(source).toContain("uploadPhotoOriginal");
  });

  it("requests lightbox bytes on the collection detail pager", () => {
    const source = readFileSync(collectionDetailPath, "utf8");
    expect(source).toContain('resolvePhotoUrl(photo.photoUrl, "lightbox")');
  });

  it("exposes strip and lightbox on resolvePhotoUrl", () => {
    const source = readFileSync(join(__dirname, "../src/api/collection.ts"), "utf8");
    expect(source).toContain("variant?: CollectionPhotoVariantQuery");
    expect(source).toContain("variant=${");
  });
});
