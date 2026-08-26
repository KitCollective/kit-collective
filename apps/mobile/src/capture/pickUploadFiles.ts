import type { PickDocumentImagesOptions } from "./pickDocumentImages";
import type { PickGalleryPhotosOptions } from "./pickGalleryPhotos";

export type PickUploadFilesOptions = {
  allowsMultipleSelection?: boolean;
};

export type UploadSource = "gallery" | "documents";

export type UploadActionSheetRequest = {
  options: string[];
  cancelButtonIndex: number;
};

export type UploadAlertButtonStyle = "cancel" | "default" | "destructive";

export type UploadAlertButton = {
  text: string;
  style?: UploadAlertButtonStyle;
  onPress?: () => void;
};

export type UploadFilesAdapter = {
  os: string;
  showActionSheet: (
    request: UploadActionSheetRequest,
    callback: (buttonIndex: number) => void,
  ) => void;
  showAlert: (title: string, message: string, buttons: UploadAlertButton[]) => void;
  pickGalleryPhotos: (options: PickGalleryPhotosOptions) => Promise<string[] | null>;
  pickDocumentImages: (options: PickDocumentImagesOptions) => Promise<string[] | null>;
  galleryMultiSelectQuality: () => number;
};

async function pickFromGallery(
  options: PickUploadFilesOptions,
  adapter: UploadFilesAdapter,
): Promise<string[] | null> {
  return adapter.pickGalleryPhotos({
    allowsMultipleSelection: options.allowsMultipleSelection ?? true,
    quality: adapter.galleryMultiSelectQuality(),
  });
}

async function pickFromDocuments(
  options: PickUploadFilesOptions,
  adapter: UploadFilesAdapter,
): Promise<string[] | null> {
  return adapter.pickDocumentImages({
    multiple: options.allowsMultipleSelection ?? true,
  });
}

function showUploadSourcePicker(adapter: UploadFilesAdapter): Promise<UploadSource | null> {
  if (adapter.os === "ios") {
    return new Promise((resolve) => {
      adapter.showActionSheet(
        {
          options: ["Fotos", "Filer", "Annuller"],
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            resolve("gallery");
            return;
          }
          if (buttonIndex === 1) {
            resolve("documents");
            return;
          }
          resolve(null);
        },
      );
    });
  }

  return new Promise((resolve) => {
    adapter.showAlert("Upload filer", "Vælg hvor billederne skal hentes fra.", [
      { text: "Galleri", onPress: () => resolve("gallery") },
      { text: "Filer", onPress: () => resolve("documents") },
      { text: "Annuller", style: "cancel", onPress: () => resolve(null) },
    ]);
  });
}

/**
 * Upload filer entry point: Photos library or Files/documents picker per platform.
 */
export async function pickUploadFiles(
  options: PickUploadFilesOptions = {},
  adapter: UploadFilesAdapter,
): Promise<string[] | null> {
  if (adapter.os === "web") {
    return pickFromGallery(options, adapter);
  }

  const source = await showUploadSourcePicker(adapter);
  if (!source) {
    return null;
  }

  switch (source) {
    case "gallery":
      return pickFromGallery(options, adapter);
    case "documents":
      return pickFromDocuments(options, adapter);
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}
