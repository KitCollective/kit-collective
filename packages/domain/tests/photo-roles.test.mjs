import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_USER_JERSEY_PHOTOS,
  PHOTO_ROLES,
  UNIVERSAL_PHOTO_ROLES,
  validateJerseyPhotos,
} from "../src/photo-roles.ts";

test("PhotoRole enum is front | back | left | right | other", () => {
  assert.deepEqual(PHOTO_ROLES, ["front", "back", "left", "right", "other"]);
  assert.deepEqual(UNIVERSAL_PHOTO_ROLES, ["front", "back", "left", "right"]);
});

test("validateJerseyPhotos accepts one photo and up to ten", () => {
  assert.equal(validateJerseyPhotos([{ role: "front" }]), null);
  assert.equal(
    validateJerseyPhotos(
      Array.from({ length: MAX_USER_JERSEY_PHOTOS }, () => ({ role: "other" })),
    ),
    null,
  );
});

test("validateJerseyPhotos rejects more than ten photos", () => {
  assert.equal(
    validateJerseyPhotos(
      Array.from({ length: MAX_USER_JERSEY_PHOTOS + 1 }, () => ({ role: "other" })),
    ),
    "too_many_photos",
  );
});

test("validateJerseyPhotos rejects a second universal of the same role", () => {
  assert.equal(
    validateJerseyPhotos([{ role: "front" }, { role: "front" }]),
    "duplicate_universal_role",
  );
});

test("validateJerseyPhotos accepts two other photos", () => {
  assert.equal(
    validateJerseyPhotos([
      { role: "front" },
      { role: "other", label: "Vaskemærke" },
      { role: "other" },
    ]),
    null,
  );
});

test("validateJerseyPhotos rejects label on a universal role", () => {
  assert.equal(
    validateJerseyPhotos([{ role: "front", label: "oops" }]),
    "label_on_universal_role",
  );
});
