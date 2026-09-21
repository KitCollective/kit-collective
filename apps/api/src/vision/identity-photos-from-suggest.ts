import type { VisionIdentityPhotoInput } from "./vision.adapter.js";

const IDENTITY_SUGGEST_PHOTO_CAP = 8;

const ROLE_PRIORITY: Record<string, number> = {
  front: 0,
  back: 1,
};

export function decodeBase64Photo(contentBase64: string): Uint8Array {
  const commaIndex = contentBase64.indexOf(",");
  const normalized = commaIndex >= 0 ? contentBase64.slice(commaIndex + 1) : contentBase64;
  const bytes = Buffer.from(normalized, "base64");
  if (bytes.length === 0) {
    throw new Error("Photo bytes are empty");
  }
  return Uint8Array.from(bytes);
}

/**
 * Map an identity suggest payload to infer inputs. Caps at 8 (prompt 1–8 photos).
 * Order: front, back, then other roles so crest/sponsor lead the VLM context.
 */
export function identityPhotosFromSuggestRequest(
  photos: Array<{ role: string; contentBase64: string }>,
): VisionIdentityPhotoInput[] {
  return photos
    .map((photo, index) => ({
      photo,
      index,
      rank: ROLE_PRIORITY[photo.role] ?? 2,
    }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, IDENTITY_SUGGEST_PHOTO_CAP)
    .map(({ photo }) => ({
      role: photo.role,
      bytes: decodeBase64Photo(photo.contentBase64),
    }));
}
