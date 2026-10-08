import { gridPhotoObjectKey, legacyPhotoObjectKey } from "@kit/domain";
import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { createMemoryObjectStore } from "../dist/collection/object-store.js";
import { resolveStoredPhotoBytes } from "../dist/collection/photo-variant-resolve.js";

const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9]);
const userId = "11111111-1111-1111-1111-111111111111";
const jerseyId = "22222222-2222-2222-2222-222222222222";
const photoId = "33333333-3333-3333-3333-333333333333";

describe("resolveStoredPhotoBytes", () => {
  it("returns grid bytes for variant=grid", async () => {
    const store = createMemoryObjectStore();
    const gridKey = gridPhotoObjectKey(userId, jerseyId, photoId);
    await store.putObject(gridKey, JPEG_BYTES);

    const bytes = await resolveStoredPhotoBytes(store, gridKey, "grid");
    expect(bytes).toEqual(JPEG_BYTES);
  });

  it("falls back to legacy {photoId}.jpg when grid is missing", async () => {
    const store = createMemoryObjectStore();
    const legacyKey = legacyPhotoObjectKey(userId, jerseyId, photoId);
    await store.putObject(legacyKey, JPEG_BYTES);

    const bytes = await resolveStoredPhotoBytes(store, legacyKey);
    expect(bytes).toEqual(JPEG_BYTES);
  });

  it("rejects original for collector clients", async () => {
    const store = createMemoryObjectStore();
    const gridKey = gridPhotoObjectKey(userId, jerseyId, photoId);
    await store.putObject(gridKey, JPEG_BYTES);
    await store.putObject(`${gridKey.replace("/grid.jpg", "/")}original`, JPEG_BYTES);

    await expect(resolveStoredPhotoBytes(store, gridKey, "original")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("returns strip bytes when strip.jpg exists", async () => {
    const store = createMemoryObjectStore();
    const gridKey = gridPhotoObjectKey(userId, jerseyId, photoId);
    const stripKey = `${gridKey.replace("/grid.jpg", "/")}strip.jpg`;
    await store.putObject(gridKey, JPEG_BYTES);
    await store.putObject(stripKey, Uint8Array.from([0x01, 0x02, 0x03]));

    const bytes = await resolveStoredPhotoBytes(store, gridKey, "strip");
    expect(bytes).toEqual(Uint8Array.from([0x01, 0x02, 0x03]));
  });
});
