import * as FileSystem from "expo-file-system";

export async function readPhotoBase64(uri: string): Promise<string> {
  if (uri.startsWith("data:")) {
    return uri.split(",")[1] ?? "";
  }
  return await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export function captureQualityForRole(role: string): number {
  return role === "label" ? 0.92 : 0.8;
}
