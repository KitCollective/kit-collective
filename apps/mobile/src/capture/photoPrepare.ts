import type { PhotoRole } from "@kit/domain";
import { isUniversalPhotoRole } from "@kit/domain";
import type { CaptureJerseyDraft } from "./captureSessionTypes";

export function captureQualityForRole(role: string): number {
  return role === "other" ? 0.92 : 0.8;
}

/** Long-edge caps for on-device prepare before Save / Vision / grouping. */
export const DISPLAY_MAX_EDGE_UNIVERSAL = 1600;
export const DISPLAY_MAX_EDGE_OTHER = 2400;
export const VISION_IDENTITY_MAX_EDGE = 1536;
export const GROUPING_THUMB_MAX_EDGE = 384;

export type PhotoPreparePurpose = "display" | "visionIdentity" | "groupingThumb";

export type PhotoResizeAction = {
  resize: {
    width?: number;
    height?: number;
  };
};

export type PhotoManipulatorAdapter = {
  getImageInfo: (uri: string) => Promise<{ width: number; height: number }>;
  manipulateAsync: (
    uri: string,
    actions: PhotoResizeAction[],
    options: { compress: number; format: "jpeg"; includeBase64: boolean },
  ) => Promise<{ uri: string; width: number; height: number; base64?: string }>;
};

export type PreparedPhoto = {
  uri: string;
  width: number;
  height: number;
  base64: string;
  format: "jpeg";
};

export function displayMaxEdgeForRole(role: PhotoRole): number {
  return isUniversalPhotoRole(role) ? DISPLAY_MAX_EDGE_UNIVERSAL : DISPLAY_MAX_EDGE_OTHER;
}

export function maxEdgeForPrepare(purpose: PhotoPreparePurpose, role: PhotoRole): number {
  if (purpose === "visionIdentity") {
    return VISION_IDENTITY_MAX_EDGE;
  }
  if (purpose === "groupingThumb") {
    return GROUPING_THUMB_MAX_EDGE;
  }
  return displayMaxEdgeForRole(role);
}

export function resizeActionForMaxLongEdge(
  width: number,
  height: number,
  maxLongEdge: number,
): PhotoResizeAction | null {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return null;
  }
  if (width >= height) {
    return { resize: { width: maxLongEdge } };
  }
  return { resize: { height: maxLongEdge } };
}

/**
 * Resize to a capped long edge and always emit JPEG (HEIC/PNG inputs become JPEG).
 * The source `uri` stays on disk for Confirm; this returns a new prepared file URI + bytes.
 */
export async function prepareDevicePhoto(
  uri: string,
  role: PhotoRole,
  purpose: PhotoPreparePurpose,
  adapter: PhotoManipulatorAdapter,
): Promise<PreparedPhoto> {
  const maxLongEdge = maxEdgeForPrepare(purpose, role);
  const { width, height } = await adapter.getImageInfo(uri);
  const resize = resizeActionForMaxLongEdge(width, height, maxLongEdge);
  const actions = resize ? [resize] : [];
  const compress = captureQualityForRole(role);

  const result = await adapter.manipulateAsync(uri, actions, {
    compress,
    format: "jpeg",
    includeBase64: true,
  });

  if (!result.base64) {
    throw new Error("Prepared photo missing base64");
  }

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    base64: result.base64,
    format: "jpeg",
  };
}

const prepareCache = new Map<string, Promise<PreparedPhoto>>();

function cacheKey(uri: string, role: PhotoRole, purpose: PhotoPreparePurpose): string {
  return `${uri}::${role}::${purpose}`;
}

function rememberPreparedPhoto(
  key: string,
  pending: Promise<PreparedPhoto>,
): Promise<PreparedPhoto> {
  prepareCache.set(key, pending);
  void pending.catch(() => {
    prepareCache.delete(key);
  });
  return pending;
}

/**
 * Fire-and-forget device prepare after a photo lands in the draft (camera/gallery/files).
 * Does not replace the draft URI shown on Confirm.
 */
export function scheduleDevicePhotoPrepare(
  uri: string,
  role: PhotoRole,
  purpose: PhotoPreparePurpose,
  adapter: PhotoManipulatorAdapter,
): void {
  const key = cacheKey(uri, role, purpose);
  if (prepareCache.has(key)) {
    return;
  }
  rememberPreparedPhoto(key, prepareDevicePhoto(uri, role, purpose, adapter));
}

export async function readPreparedDevicePhotoBase64(
  uri: string,
  role: PhotoRole,
  purpose: PhotoPreparePurpose,
  adapter: PhotoManipulatorAdapter,
): Promise<string> {
  const key = cacheKey(uri, role, purpose);
  let pending = prepareCache.get(key);
  if (!pending) {
    pending = rememberPreparedPhoto(key, prepareDevicePhoto(uri, role, purpose, adapter));
  }
  const prepared = await pending;
  return prepared.base64;
}

export function warmDevicePrepareForDraft(
  draft: CaptureJerseyDraft,
  adapter: PhotoManipulatorAdapter,
): void {
  for (const photo of draft.photos) {
    if (photo.role === null) {
      continue;
    }
    scheduleDevicePhotoPrepare(photo.uri, photo.role, "display", adapter);
  }

  const firstBound = draft.photos.find((photo) => photo.role !== null);
  if (firstBound?.role) {
    scheduleDevicePhotoPrepare(firstBound.uri, firstBound.role, "visionIdentity", adapter);
  }
}

/** Test-only reset for vitest isolation. */
export function clearDevicePhotoPrepareCacheForTests(): void {
  prepareCache.clear();
}
