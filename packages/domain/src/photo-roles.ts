/** Closed set for UserJerseyPhoto.role — stored value, not free text. */
export const PHOTO_ROLES = ["front", "back", "left", "right", "other"] as const;
export type PhotoRole = (typeof PHOTO_ROLES)[number];

/** Universal roles — at most one of each per UserJersey. */
export const UNIVERSAL_PHOTO_ROLES = ["front", "back", "left", "right"] as const;
export type UniversalPhotoRole = (typeof UNIVERSAL_PHOTO_ROLES)[number];

export const MAX_USER_JERSEY_PHOTOS = 10;

/** Danish labels for photo role slots (UI only). */
export const PHOTO_ROLE_LABELS_DA: Record<PhotoRole, string> = {
  front: "Forside",
  back: "Bagside",
  left: "Venstre",
  right: "Højre",
  other: "Andet",
};

export function isUniversalPhotoRole(role: PhotoRole): role is UniversalPhotoRole {
  return (UNIVERSAL_PHOTO_ROLES as readonly string[]).includes(role);
}

export type JerseyPhotoInput = {
  role: PhotoRole;
  label?: string | null | undefined;
};

export type JerseyPhotoValidationError =
  | "too_few_photos"
  | "too_many_photos"
  | "duplicate_universal_role"
  | "label_on_universal_role";

export function validateJerseyPhotos(photos: JerseyPhotoInput[]): JerseyPhotoValidationError | null {
  if (photos.length < 1) {
    return "too_few_photos";
  }
  if (photos.length > MAX_USER_JERSEY_PHOTOS) {
    return "too_many_photos";
  }

  const universalSeen = new Set<UniversalPhotoRole>();
  for (const photo of photos) {
    const label = photo.label?.trim();
    if (label && photo.role !== "other") {
      return "label_on_universal_role";
    }
    if (isUniversalPhotoRole(photo.role)) {
      if (universalSeen.has(photo.role)) {
        return "duplicate_universal_role";
      }
      universalSeen.add(photo.role);
    }
  }

  return null;
}
