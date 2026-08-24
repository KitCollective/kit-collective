import * as DocumentPicker from "expo-document-picker";

type PickDocumentImagesOptions = {
  multiple?: boolean;
};

/**
 * Open the system document picker for image files (iOS Files, Android documents).
 * Returns asset URIs in picker order, or null when cancelled.
 */
export async function pickDocumentImages(
  options: PickDocumentImagesOptions = {},
): Promise<string[] | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "image/*",
    multiple: options.multiple ?? true,
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return null;
  }

  const assets = "assets" in result ? result.assets : [result];
  const uris = assets.map((asset) => asset.uri).filter((uri): uri is string => Boolean(uri));
  return uris.length > 0 ? uris : null;
}
