import { gridPhotoObjectKey } from "@kit/domain";
import { describe, expect, it } from "vitest";
import { createMemoryObjectStore } from "../dist/collection/object-store.js";
import {
  renderGridVariant,
  renderLightboxVariant,
  renderStripVariant,
  storeGpsStrippedOriginal,
  writeStripAndLightboxVariants,
} from "../dist/collection/photo-derivatives.js";
import { resolveStoredPhotoBytes } from "../dist/collection/photo-variant-resolve.js";

const userId = "11111111-1111-1111-1111-111111111111";
const jerseyId = "22222222-2222-2222-2222-222222222222";
const photoId = "33333333-3333-3333-3333-333333333333";

/** 2×3 landscape JPEG generated with sharp in a prior test run — replaced by inline fixture. */
async function createLandscapeJpeg(width = 1200, height = 900): Promise<Uint8Array> {
  const sharp = (await import("sharp")).default;
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 80, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();
  return Uint8Array.from(buffer);
}

describe("photo derivatives", () => {
  it("renders a 4:5 strip variant", async () => {
    const source = await createLandscapeJpeg();
    const strip = await renderStripVariant(source);
    const sharp = (await import("sharp")).default;
    const meta = await sharp(Buffer.from(strip)).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(800);
  });

  it("renders an uncropped lightbox larger than a center-cropped grid tile", async () => {
    const source = await createLandscapeJpeg(2400, 1800);
    const grid = await renderGridVariant(source);
    const lightbox = await renderLightboxVariant(source, "front");
    expect(lightbox.length).toBeGreaterThan(grid.length);
    const sharp = (await import("sharp")).default;
    const lightboxMeta = await sharp(Buffer.from(lightbox)).metadata();
    expect(lightboxMeta.width).toBe(1600);
    expect(lightboxMeta.height).toBe(1200);
    const gridMeta = await sharp(Buffer.from(grid)).metadata();
    expect(gridMeta.width).toBe(800);
    expect(gridMeta.height).toBe(1000);
  });

  it("stores original without EXIF GPS metadata", async () => {
    const sharp = (await import("sharp")).default;
    const withGps = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .jpeg()
      .withMetadata({
        exif: {
          IFD0: {
            GPSLatitude: "55/1,40/1,0/1",
            GPSLongitude: "12/1,34/1,0/1",
          },
        },
      })
      .toBuffer();

    const store = createMemoryObjectStore();
    const gridKey = gridPhotoObjectKey(userId, jerseyId, photoId);
    const originalKey = `${gridKey.replace("/grid.jpg", "/")}original`;
    await storeGpsStrippedOriginal(store, originalKey, Uint8Array.from(withGps));

    const stored = await store.getObject(originalKey);
    expect(stored).not.toBeNull();
    if (!stored) {
      throw new Error("expected stored original bytes");
    }
    const meta = await sharp(Buffer.from(stored)).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("writes strip and lightbox under the photo prefix", async () => {
    const store = createMemoryObjectStore();
    const gridKey = gridPhotoObjectKey(userId, jerseyId, photoId);
    const source = await createLandscapeJpeg();
    await store.putObject(gridKey, source);

    await writeStripAndLightboxVariants(store, {
      userId,
      jerseyId,
      photoId,
      role: "front",
      sourceObjectKey: gridKey,
    });

    const prefix = gridKey.replace("/grid.jpg", "/");
    expect(await store.objectExists(`${prefix}grid.jpg`)).toBe(true);
    expect(await store.objectExists(`${prefix}strip.jpg`)).toBe(true);
    expect(await store.objectExists(`${prefix}lightbox.jpg`)).toBe(true);
  });

  it("serves strip and lightbox variants with grid fallback", async () => {
    const store = createMemoryObjectStore();
    const gridKey = gridPhotoObjectKey(userId, jerseyId, photoId);
    const source = await createLandscapeJpeg();
    await store.putObject(gridKey, source);

    const stripOnly = await resolveStoredPhotoBytes(store, gridKey, "strip");
    expect(stripOnly).toEqual(source);

    await writeStripAndLightboxVariants(store, {
      userId,
      jerseyId,
      photoId,
      role: "front",
      sourceObjectKey: gridKey,
    });

    const strip = await resolveStoredPhotoBytes(store, gridKey, "strip");
    const lightbox = await resolveStoredPhotoBytes(store, gridKey, "lightbox");
    expect(strip).not.toEqual(source);
    expect(lightbox).not.toEqual(source);
    expect(strip?.length).toBeGreaterThan(0);
    expect(lightbox?.length).toBeGreaterThan(strip?.length ?? 0);
  });
});
