import { ForbiddenException } from "@nestjs/common";
import {
  gridPhotoObjectKey,
  isCollectorPhotoVariant,
  isLegacyPhotoObjectKey,
  isReservedPhotoVariant,
  legacyPhotoObjectKeyFromPrefix,
  photoPrefixFromStoredObjectKey,
  variantObjectKey,
} from "@kit/domain";
import type { CollectionPhotoVariantQuery } from "@kit/api-contract";
import type { ObjectStoreAdapter } from "./object-store.js";

export async function resolveStoredPhotoBytes(
  objectStore: ObjectStoreAdapter,
  storedObjectKey: string,
  variant?: CollectionPhotoVariantQuery,
  options: { allowReservedVariants?: boolean } = {},
): Promise<Uint8Array | null> {
  if (variant && isReservedPhotoVariant(variant) && !options.allowReservedVariants) {
    throw new ForbiddenException("Photo variant is not available");
  }

  if (variant && !isCollectorPhotoVariant(variant) && !isReservedPhotoVariant(variant)) {
    throw new ForbiddenException("Unknown photo variant");
  }

  const prefix = photoPrefixFromStoredObjectKey(storedObjectKey);

  if (variant && isCollectorPhotoVariant(variant) && prefix) {
    const variantKey = variantObjectKey(prefix, variant);
    const variantBytes = await objectStore.getObject(variantKey);
    if (variantBytes) {
      return variantBytes;
    }
  }

  if (!variant || isCollectorPhotoVariant(variant ?? "grid")) {
    if (prefix) {
      const gridKey = variantObjectKey(prefix, "grid");
      const gridBytes = await objectStore.getObject(gridKey);
      if (gridBytes) {
        return gridBytes;
      }

      const legacyKey = legacyPhotoObjectKeyFromPrefix(prefix);
      const legacyBytes = await objectStore.getObject(legacyKey);
      if (legacyBytes) {
        return legacyBytes;
      }
    }

    if (isLegacyPhotoObjectKey(storedObjectKey)) {
      return objectStore.getObject(storedObjectKey);
    }
  }

  if (variant && isReservedPhotoVariant(variant) && prefix && options.allowReservedVariants) {
    const reservedKey = `${prefix}${variant === "original" ? "original" : `${variant}.jpg`}`;
    return objectStore.getObject(reservedKey);
  }

  const directBytes = await objectStore.getObject(storedObjectKey);
  return directBytes;
}

export function gridObjectKeyForNewPhoto(
  userId: string,
  jerseyId: string,
  photoId: string,
): string {
  return gridPhotoObjectKey(userId, jerseyId, photoId);
}
