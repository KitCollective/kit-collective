import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gridPhotoObjectKey,
  isCollectorPhotoVariant,
  isLegacyPhotoObjectKey,
  isReservedPhotoVariant,
  legacyPhotoObjectKey,
  legacyPhotoObjectKeyFromPrefix,
  maxSavePhotoBytesForRole,
  photoObjectKeysForDeletion,
  photoPrefix,
  photoPrefixFromStoredObjectKey,
} from "../dist/photo-variants.js";

describe("photo-variants", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const jerseyId = "22222222-2222-2222-2222-222222222222";
  const photoId = "33333333-3333-3333-3333-333333333333";

  it("builds prefix and grid keys", () => {
    assert.equal(photoPrefix(userId, jerseyId, photoId), `user/${userId}/${jerseyId}/${photoId}/`);
    assert.equal(
      gridPhotoObjectKey(userId, jerseyId, photoId),
      `user/${userId}/${jerseyId}/${photoId}/grid.jpg`,
    );
    assert.equal(
      legacyPhotoObjectKey(userId, jerseyId, photoId),
      `user/${userId}/${jerseyId}/${photoId}.jpg`,
    );
  });

  it("detects legacy keys and derives prefix", () => {
    const legacy = legacyPhotoObjectKey(userId, jerseyId, photoId);
    assert.equal(isLegacyPhotoObjectKey(legacy), true);
    assert.equal(photoPrefixFromStoredObjectKey(legacy), `user/${userId}/${jerseyId}/${photoId}/`);
    assert.equal(legacyPhotoObjectKeyFromPrefix(`user/${userId}/${jerseyId}/${photoId}/`), legacy);
  });

  it("derives prefix from grid key", () => {
    const grid = gridPhotoObjectKey(userId, jerseyId, photoId);
    assert.equal(isLegacyPhotoObjectKey(grid), false);
    assert.equal(photoPrefixFromStoredObjectKey(grid), `user/${userId}/${jerseyId}/${photoId}/`);
  });

  it("lists all keys to delete for a stored grid key", () => {
    const grid = gridPhotoObjectKey(userId, jerseyId, photoId);
    const keys = photoObjectKeysForDeletion(grid);
    assert.ok(keys.includes(grid));
    assert.ok(keys.includes(legacyPhotoObjectKey(userId, jerseyId, photoId)));
    assert.ok(keys.includes(`user/${userId}/${jerseyId}/${photoId}/original`));
    assert.ok(keys.includes(`user/${userId}/${jerseyId}/${photoId}/strip.jpg`));
    assert.ok(keys.includes(`user/${userId}/${jerseyId}/${photoId}/lightbox.jpg`));
  });

  it("treats strip and lightbox as collector variants", () => {
    assert.equal(isCollectorPhotoVariant("strip"), true);
    assert.equal(isCollectorPhotoVariant("lightbox"), true);
    assert.equal(isReservedPhotoVariant("original"), true);
  });

  it("uses role-specific save byte caps", () => {
    assert.ok(maxSavePhotoBytesForRole("front") < maxSavePhotoBytesForRole("other"));
  });
});
