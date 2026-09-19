import type { VisionSuggestRequest } from "@kit/api-contract";
import type { PhotoRole } from "@kit/domain";
import type { CaptureJerseyDraft } from "./captureSessionTypes";
import { readPreparedPhotoBase64 } from "./photoBytes";

function photoRoleForVision(role: PhotoRole | null): PhotoRole {
  return role ?? "front";
}

/** Shared identity Vision suggest payload for signed Confirm and unsigned first-session. */
export async function buildIdentitySuggestRequest(
  draft: CaptureJerseyDraft,
): Promise<VisionSuggestRequest> {
  const photos = await Promise.all(
    draft.photos.map(async (photo) => ({
      role: photoRoleForVision(photo.role),
      contentBase64: await readPreparedPhotoBase64(
        photo.uri,
        photoRoleForVision(photo.role),
        "visionIdentity",
      ),
    })),
  );

  return {
    draftId: draft.id,
    photos,
  };
}
