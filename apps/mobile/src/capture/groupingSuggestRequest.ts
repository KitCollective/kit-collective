import {
  type VisionGroupingSuggestRequest,
  visionGroupingSuggestRequestSchema,
} from "@kit/api-contract";
import { isUuid } from "./captureSession";

export type GroupingPreparedPhoto = {
  photoId: string;
  contentBase64: string;
};

/** Client-side contract check. Invalid sessionId is dropped (optional) so photoIds can still POST. */
export function buildGroupingSuggestRequest(input: {
  sessionId: string;
  photos: GroupingPreparedPhoto[];
  priorGroups: Array<{ photoIds: string[] }>;
}): VisionGroupingSuggestRequest | null {
  const photos = input.photos.filter(
    (photo) => isUuid(photo.photoId) && photo.contentBase64.length > 0,
  );
  const priorGroups = input.priorGroups
    .map((group) => ({ photoIds: group.photoIds.filter((photoId) => isUuid(photoId)) }))
    .filter((group) => group.photoIds.length > 0);

  if (photos.length < 2 && (photos.length < 1 || priorGroups.length === 0)) {
    return null;
  }

  const parsed = visionGroupingSuggestRequestSchema.safeParse({
    sessionId: isUuid(input.sessionId) ? input.sessionId : undefined,
    photos,
    priorGroups: priorGroups.length > 0 ? priorGroups : undefined,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Fast Refresh keeps refs (`startedFingerprint`) while resetting `analyzing`.
 * Skip only while a run is live or this fingerprint already failed — not because
 * we once touched the key.
 */
export function shouldBeginGroupingStart(input: {
  jobKey: string | null;
  analyzing: boolean;
  failed: boolean;
}): boolean {
  return Boolean(input.jobKey) && !input.analyzing && !input.failed;
}

export function closeGroupingRun(reason: "timeout" | "error" | "skip" | "complete"): {
  analyzing: false;
  failed: boolean;
} {
  return { analyzing: false, failed: reason !== "complete" };
}
