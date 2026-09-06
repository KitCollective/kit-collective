/** Named JPEG variants under a UserJerseyPhoto prefix (collector-visible). */
export const COLLECTOR_PHOTO_VARIANTS = ["grid"] as const;
export type CollectorPhotoVariant = (typeof COLLECTOR_PHOTO_VARIANTS)[number];

/** Reserved for later slices — not served on collector GET in KIT-218. */
export const RESERVED_PHOTO_VARIANTS = ["strip", "lightbox", "original"] as const;
export type ReservedPhotoVariant = (typeof RESERVED_PHOTO_VARIANTS)[number];

export type PhotoVariantQuery = CollectorPhotoVariant | ReservedPhotoVariant;

/** Guard when client prepare is skipped — matches device display long-edge caps at JPEG quality. */
export const MAX_SAVE_PHOTO_BYTES_UNIVERSAL = 2 * 1024 * 1024;
export const MAX_SAVE_PHOTO_BYTES_OTHER = 4 * 1024 * 1024;

const LEGACY_PHOTO_KEY_PATTERN = /^user\/[^/]+\/[^/]+\/[^/]+\.jpg$/;

export function photoPrefix(userId: string, jerseyId: string, photoId: string): string {
  return `user/${userId}/${jerseyId}/${photoId}/`;
}

export function gridPhotoObjectKey(userId: string, jerseyId: string, photoId: string): string {
  return `${photoPrefix(userId, jerseyId, photoId)}grid.jpg`;
}

export function legacyPhotoObjectKey(userId: string, jerseyId: string, photoId: string): string {
  return `user/${userId}/${jerseyId}/${photoId}.jpg`;
}

export function isLegacyPhotoObjectKey(objectKey: string): boolean {
  return LEGACY_PHOTO_KEY_PATTERN.test(objectKey);
}

export function photoPrefixFromStoredObjectKey(objectKey: string): string | null {
  if (isLegacyPhotoObjectKey(objectKey)) {
    const match = objectKey.match(/^(user\/[^/]+\/[^/]+\/[^/]+)\.jpg$/);
    return match ? `${match[1]}/` : null;
  }

  const namedVariantMatch = objectKey.match(
    /^(user\/[^/]+\/[^/]+\/[^/]+)\/(?:grid|strip|lightbox)\.jpg$/,
  );
  if (namedVariantMatch) {
    return `${namedVariantMatch[1]}/`;
  }

  if (objectKey.endsWith("/original")) {
    const match = objectKey.match(/^(user\/[^/]+\/[^/]+\/[^/]+)\/original$/);
    return match ? `${match[1]}/` : null;
  }

  return null;
}

export function legacyPhotoObjectKeyFromPrefix(prefix: string): string {
  return `${prefix.slice(0, -1)}.jpg`;
}

export function variantObjectKey(prefix: string, variant: CollectorPhotoVariant): string {
  return `${prefix}${variant}.jpg`;
}

export function maxSavePhotoBytesForRole(role: string): number {
  return role === "other" ? MAX_SAVE_PHOTO_BYTES_OTHER : MAX_SAVE_PHOTO_BYTES_UNIVERSAL;
}

export function isCollectorPhotoVariant(value: string): value is CollectorPhotoVariant {
  return (COLLECTOR_PHOTO_VARIANTS as readonly string[]).includes(value);
}

export function isReservedPhotoVariant(value: string): value is ReservedPhotoVariant {
  return (RESERVED_PHOTO_VARIANTS as readonly string[]).includes(value);
}

/** Keys to remove when a UserJerseyPhoto row is deleted (prefix + legacy). */
export function photoObjectKeysForDeletion(storedObjectKey: string): string[] {
  const keys = new Set<string>([storedObjectKey]);
  const prefix = photoPrefixFromStoredObjectKey(storedObjectKey);

  if (!prefix) {
    return [...keys];
  }

  keys.add(variantObjectKey(prefix, "grid"));
  keys.add(`${prefix}strip.jpg`);
  keys.add(`${prefix}lightbox.jpg`);
  keys.add(`${prefix}original`);
  keys.add(legacyPhotoObjectKeyFromPrefix(prefix));

  return [...keys];
}
