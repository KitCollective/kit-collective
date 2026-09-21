import type { VisionSuggestRequest } from "@kit/api-contract";
import type { PhotoRole } from "@kit/domain";
import type { CaptureJerseyDraft } from "./captureSessionTypes";
import { readPreparedPhotoBase64 } from "./photoBytes";

export const IDENTITY_PHOTOS_EMPTY = "IDENTITY_PHOTOS_EMPTY";

function photoRoleForVision(role: PhotoRole | null): PhotoRole {
  return role ?? "front";
}

/** Shared identity Vision suggest payload for signed Confirm and unsigned first-session. */
export async function buildIdentitySuggestRequest(
  draft: CaptureJerseyDraft,
): Promise<VisionSuggestRequest> {
  const photos: Array<{ role: PhotoRole; contentBase64: string }> = [];
  for (const photo of draft.photos) {
    const role = photoRoleForVision(photo.role);
    try {
      const contentBase64 = await readPreparedPhotoBase64(photo.uri, role, "visionIdentity");
      if (contentBase64.length < 32) {
        continue;
      }
      photos.push({ role, contentBase64 });
    } catch {
      // One unreadable URI must not drop the rest of the shirt.
    }
  }

  if (photos.length === 0) {
    throw new Error(IDENTITY_PHOTOS_EMPTY);
  }

  return {
    draftId: draft.id,
    photos,
  };
}
