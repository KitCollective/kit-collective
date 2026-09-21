import type { VisionSuggestRequest } from "@kit/api-contract";
import type { PhotoRole } from "@kit/domain";
import type { CaptureJerseyDraft } from "./captureSessionTypes";
import type { PhotoPreparePurpose } from "./photoPrepare";

export const IDENTITY_PHOTOS_EMPTY = "IDENTITY_PHOTOS_EMPTY";

export type IdentityPhotoReader = (
  uri: string,
  role: PhotoRole,
  purpose: PhotoPreparePurpose,
) => Promise<string>;

const IDENTITY_PHOTO_ROLE_RANK: Record<PhotoRole, number> = {
  front: 0,
  back: 1,
  left: 2,
  right: 3,
  other: 4,
};

function photoRoleForVision(role: PhotoRole | null): PhotoRole {
  return role ?? "front";
}

async function defaultReadPreparedPhotoBase64(
  uri: string,
  role: PhotoRole,
  purpose: PhotoPreparePurpose,
): Promise<string> {
  const { readPreparedPhotoBase64 } = await import("./photoBytes");
  return readPreparedPhotoBase64(uri, role, purpose);
}

/** Filters empty bytes, defaults null roles, and orders front → back → others (crest first). */
export function identitySuggestPhotosFromPrepared(
  photos: Array<{ role: PhotoRole | null; contentBase64: string }>,
): Array<{ role: PhotoRole; contentBase64: string }> {
  return photos
    .filter((photo) => photo.contentBase64.length >= 32)
    .map((photo, index) => ({
      role: photoRoleForVision(photo.role),
      contentBase64: photo.contentBase64,
      index,
    }))
    .sort((left, right) => {
      const rankDelta = IDENTITY_PHOTO_ROLE_RANK[left.role] - IDENTITY_PHOTO_ROLE_RANK[right.role];
      return rankDelta !== 0 ? rankDelta : left.index - right.index;
    })
    .map(({ role, contentBase64 }) => ({ role, contentBase64 }));
}

/** Shared identity Vision suggest payload for signed Confirm and unsigned first-session. */
export async function buildIdentitySuggestRequest(
  draft: CaptureJerseyDraft,
  readBase64: IdentityPhotoReader = defaultReadPreparedPhotoBase64,
): Promise<VisionSuggestRequest> {
  const prepared: Array<{ role: PhotoRole | null; contentBase64: string }> = [];
  for (const photo of draft.photos) {
    const role = photoRoleForVision(photo.role);
    try {
      const contentBase64 = await readBase64(photo.uri, role, "visionIdentity");
      prepared.push({ role: photo.role, contentBase64 });
    } catch {
      // One unreadable URI must not drop the rest of the shirt.
    }
  }

  const photos = identitySuggestPhotosFromPrepared(prepared);
  if (photos.length === 0) {
    throw new Error(IDENTITY_PHOTOS_EMPTY);
  }

  return {
    draftId: draft.id,
    photos,
  };
}
