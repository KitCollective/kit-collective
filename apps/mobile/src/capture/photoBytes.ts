import type { PhotoRole } from "@kit/domain";
import { File } from "expo-file-system";
import { expoPhotoManipulatorAdapter } from "./expoPhotoManipulatorAdapter";
import {
  captureQualityForRole,
  type PhotoPreparePurpose,
  readPreparedDevicePhotoBase64,
  readPreparedDevicePhotoUri,
} from "./photoPrepare";

export async function readPhotoBase64(uri: string): Promise<string> {
  if (uri.startsWith("data:")) {
    return uri.split(",")[1] ?? "";
  }
  return await new File(uri).base64();
}

export { captureQualityForRole };

/** ImagePicker multi-select applies one quality to all assets — use the highest role need (other/detail). */
export function galleryMultiSelectQuality(): number {
  return captureQualityForRole("other");
}

export async function readPreparedPhotoBase64(
  uri: string,
  role: PhotoRole,
  purpose: PhotoPreparePurpose,
): Promise<string> {
  return readPreparedDevicePhotoBase64(uri, role, purpose, expoPhotoManipulatorAdapter);
}

export async function readPreparedPhotoUri(
  uri: string,
  role: PhotoRole,
  purpose: PhotoPreparePurpose,
): Promise<string> {
  return readPreparedDevicePhotoUri(uri, role, purpose, expoPhotoManipulatorAdapter);
}

export type { PhotoPreparePurpose } from "./photoPrepare";

export { warmDevicePrepareForDraftRuntime } from "./photoPrepareRuntime";
