/** Named JPEG variants under a UserJerseyPhoto prefix (collector-visible). */
export const COLLECTOR_PHOTO_VARIANTS = ["grid", "strip", "lightbox"] as const;
export type CollectorPhotoVariant = (typeof COLLECTOR_PHOTO_VARIANTS)[number];

/** Stored but not served on collector GET. */
export const RESERVED_PHOTO_VARIANTS = ["original"] as const;
export type ReservedPhotoVariant = (typeof RESERVED_PHOTO_VARIANTS)[number];

export type PhotoVariantQuery = CollectorPhotoVariant | ReservedPhotoVariant;

/** Guard when client prepare is skipped — matches device display long-edge caps at JPEG quality. */
export const MAX_SAVE_PHOTO_BYTES_UNIVERSAL = 2 * 1024 * 1024;
export const MAX_SAVE_PHOTO_BYTES_OTHER = 4 * 1024 * 1024;

/** Archive original PUT — large enough for a typical 12 MP camera JPEG after base64. */
export const MAX_ORIGINAL_PHOTO_BYTES_UNIVERSAL = 12 * 1024 * 1024;
export const MAX_ORIGINAL_PHOTO_BYTES_OTHER = 16 * 1024 * 1024;

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

export function maxOriginalPhotoBytesForRole(role: string): number {
  return role === "other" ? MAX_ORIGINAL_PHOTO_BYTES_OTHER : MAX_ORIGINAL_PHOTO_BYTES_UNIVERSAL;
}

export function isCollectorPhotoVariant(value: string): value is CollectorPhotoVariant {
  return value === "grid" || value === "strip" || value === "lightbox";
}

export function isReservedPhotoVariant(value: string): value is ReservedPhotoVariant {
  return value === "original";
}

/** Confirm strip 4:5 tile width (retina-friendly). */
export const STRIP_VARIANT_WIDTH = 640;

/** Center-crop rectangle for a 4:5 portrait tile. */
export function centerCrop4x5Rect(width: number, height: number): {
  originX: number;
  originY: number;
  width: number;
  height: number;
} {
  const targetRatio = 4 / 5;
  const sourceRatio = width / height;
  let cropWidth = width;
  let cropHeight = height;
  if (sourceRatio > targetRatio) {
    cropWidth = Math.round(height * targetRatio);
  } else {
    cropHeight = Math.round(width / targetRatio);
  }
  return {
    originX: Math.max(0, Math.round((width - cropWidth) / 2)),
    originY: Math.max(0, Math.round((height - cropHeight) / 2)),
    width: cropWidth,
    height: cropHeight,
  };
}

/** Lightbox long-edge caps — match device prepare. */
export const LIGHTBOX_MAX_EDGE_UNIVERSAL = 1600;
export const LIGHTBOX_MAX_EDGE_OTHER = 2400;

export function lightboxMaxEdgeForRole(role: string): number {
  return role === "other" ? LIGHTBOX_MAX_EDGE_OTHER : LIGHTBOX_MAX_EDGE_UNIVERSAL;
}

export function originalObjectKey(prefix: string): string {
  return `${prefix}original`;
}

export function stripObjectKey(prefix: string): string {
  return `${prefix}strip.jpg`;
}

export function lightboxObjectKey(prefix: string): string {
  return `${prefix}lightbox.jpg`;
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
