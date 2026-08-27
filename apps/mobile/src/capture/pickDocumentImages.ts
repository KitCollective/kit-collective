/**
 * Files/documents selection. Production adapter is expo-document-picker
 * (`expoDocumentPickerAdapter` in expoPickerAdapters.ts).
 */
export type PickDocumentImagesOptions = {
  multiple?: boolean;
};

export type DocumentPickerRequest = {
  type: string;
  multiple: boolean;
  copyToCacheDirectory: boolean;
};

export type DocumentPickerAsset = {
  uri?: string;
};

export type DocumentPickerResponse = {
  canceled: boolean;
  assets?: DocumentPickerAsset[];
};

export type DocumentPickerAdapter = {
  getDocumentAsync: (request: DocumentPickerRequest) => Promise<DocumentPickerResponse>;
};

/**
 * Open the system document picker for image files (iOS Files, Android documents).
 * Returns asset URIs in picker order, or null when cancelled.
 */
export async function pickDocumentImages(
  options: PickDocumentImagesOptions = {},
  adapter: DocumentPickerAdapter,
): Promise<string[] | null> {
  const result = await adapter.getDocumentAsync({
    type: "image/*",
    multiple: options.multiple ?? true,
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return null;
  }

  const uris = (result.assets ?? [])
    .map((asset) => asset.uri)
    .filter((uri): uri is string => Boolean(uri));
  return uris.length > 0 ? uris : null;
}
